-- Migration: Add Map Practice Feature Tables
-- Date: 2024-12-20
-- Description: Interactive map-based practice questions with multiple question types
--              including state/district click, fill-in-the-blank, and location marking

-- =====================================================
-- 1. ADD QUESTION TYPE AND MAP DATA TO QUESTIONS TABLE
-- =====================================================

-- Add question_type column to questions table
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'mcq' 
CHECK (question_type IN (
    'mcq',           -- Traditional multiple choice (default)
    'map_state',     -- Click on correct state
    'map_district',  -- Click on correct district  
    'map_point',     -- Click on specific point/location
    'map_multi',     -- Select multiple regions
    'map_region',    -- Select a geographical region/area
    'fill_blank',    -- Fill in the blank (text input)
    'map_fill_blank' -- Map shown, type the answer
));

-- Add map_data JSONB column for map question configuration
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS map_data JSONB;

-- Add blank_data JSONB column for fill-in-the-blank questions
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS blank_data JSONB;

COMMENT ON COLUMN questions.question_type IS 'Type of question: mcq, map_state, map_district, map_point, map_multi, map_region, fill_blank, map_fill_blank';
COMMENT ON COLUMN questions.map_data IS 'Configuration for map questions: { mapType, questionSubType, correctAnswers, focusState, toleranceKm, etc. }';
COMMENT ON COLUMN questions.blank_data IS 'Configuration for fill-blank questions: { blanks: [{ position, answers, hints }], partial_scoring, case_sensitive }';

-- =====================================================
-- 2. MAP LOCATIONS TABLE (Hierarchical Location Data)
-- =====================================================

CREATE TABLE IF NOT EXISTS map_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic Information
    name VARCHAR(255) NOT NULL,
    name_local VARCHAR(255),  -- Local language name (Hindi, etc.)
    location_type VARCHAR(50) NOT NULL,
    
    -- Hierarchical References
    parent_id UUID REFERENCES map_locations(id) ON DELETE SET NULL,
    state_id UUID REFERENCES map_locations(id) ON DELETE SET NULL,
    district_id UUID REFERENCES map_locations(id) ON DELETE SET NULL,
    
    -- Geographic Data
    coordinates JSONB,  -- { "lat": 28.61, "lng": 77.20 }
    bounding_box JSONB, -- { "north": x, "south": x, "east": x, "west": x }
    geojson_feature_id VARCHAR(100),  -- ID to match with GeoJSON files
    
    -- Difficulty & Metadata
    difficulty_score INT DEFAULT 3 CHECK (difficulty_score >= 1 AND difficulty_score <= 5),
    difficulty_factors JSONB, -- { base_type_score, population_adjust, exam_relevance_adjust }
    metadata JSONB,  -- Extra info: area_sq_km, population, year_established, famous_for, etc.
    alternate_names TEXT[],  -- For fuzzy matching: ["Bombay", "Mumbai"]
    
    -- Search text (will be populated by trigger)
    search_text TEXT,
    
    -- Audit Fields
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint within same type and parent
    CONSTRAINT unique_location_in_parent UNIQUE (name, location_type, parent_id)
);

-- Location type reference:
-- 'country', 'state', 'ut' (Union Territory), 'district', 'tehsil', 'taluka',
-- 'city', 'town', 'village',
-- 'national_park', 'wildlife_sanctuary', 'tiger_reserve', 'biosphere_reserve',
-- 'river', 'river_origin', 'river_mouth', 'river_confluence',
-- 'mountain', 'mountain_range', 'peak', 'pass',
-- 'lake', 'dam', 'reservoir',
-- 'historical_site', 'unesco_site', 'archaeological_site',
-- 'port', 'airport', 'railway_junction'

COMMENT ON TABLE map_locations IS 'Hierarchical location data for map-based practice questions';

-- =====================================================
-- 3. INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_map_locations_type ON map_locations(location_type);
CREATE INDEX IF NOT EXISTS idx_map_locations_parent ON map_locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_map_locations_state ON map_locations(state_id);
CREATE INDEX IF NOT EXISTS idx_map_locations_district ON map_locations(district_id);
CREATE INDEX IF NOT EXISTS idx_map_locations_geojson ON map_locations(geojson_feature_id);
CREATE INDEX IF NOT EXISTS idx_map_locations_difficulty ON map_locations(difficulty_score);
CREATE INDEX IF NOT EXISTS idx_map_locations_name ON map_locations(name);
CREATE INDEX IF NOT EXISTS idx_map_locations_search ON map_locations USING gin(to_tsvector('english', COALESCE(search_text, '')));

-- Index on questions for map question types
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(question_type);
CREATE INDEX IF NOT EXISTS idx_questions_map ON questions(question_type) WHERE question_type LIKE 'map_%';

-- =====================================================
-- 4. DIFFICULTY AUTO-CALCULATION TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_location_difficulty()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate base difficulty based on location type
    NEW.difficulty_score := (
        CASE NEW.location_type
            WHEN 'state' THEN 1
            WHEN 'ut' THEN 2
            WHEN 'city' THEN 2
            WHEN 'district' THEN 3
            WHEN 'tehsil' THEN 4
            WHEN 'taluka' THEN 4
            WHEN 'national_park' THEN 3
            WHEN 'wildlife_sanctuary' THEN 3
            WHEN 'tiger_reserve' THEN 3
            WHEN 'river' THEN 2
            WHEN 'river_origin' THEN 3
            WHEN 'mountain' THEN 3
            WHEN 'peak' THEN 4
            WHEN 'pass' THEN 4
            WHEN 'historical_site' THEN 3
            ELSE 3
        END
    );
    
    -- Adjust based on population (for districts, cities)
    IF NEW.metadata ? 'population' THEN
        IF (NEW.metadata->>'population')::bigint > 5000000 THEN
            NEW.difficulty_score := GREATEST(1, NEW.difficulty_score - 1);
        ELSIF (NEW.metadata->>'population')::bigint < 500000 THEN
            NEW.difficulty_score := LEAST(5, NEW.difficulty_score + 1);
        END IF;
    END IF;
    
    -- Adjust based on exam relevance
    IF NEW.metadata ? 'exam_frequency' THEN
        IF NEW.metadata->>'exam_frequency' = 'high' THEN
            NEW.difficulty_score := GREATEST(1, NEW.difficulty_score - 1);
        ELSIF NEW.metadata->>'exam_frequency' = 'low' THEN
            NEW.difficulty_score := LEAST(5, NEW.difficulty_score + 1);
        END IF;
    END IF;
    
    -- Store calculation factors
    NEW.difficulty_factors := jsonb_build_object(
        'base_type_score', NEW.difficulty_score,
        'calculated_at', NOW()
    );
    
    -- Clamp to 1-5 range
    NEW.difficulty_score := GREATEST(1, LEAST(5, NEW.difficulty_score));
    
    -- Build search text for full-text search
    NEW.search_text := NEW.name || ' ' || 
                       COALESCE(NEW.name_local, '') || ' ' || 
                       COALESCE(array_to_string(NEW.alternate_names, ' '), '');
    
    -- Update timestamp
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_calculate_location_difficulty ON map_locations;
CREATE TRIGGER auto_calculate_location_difficulty
    BEFORE INSERT OR UPDATE ON map_locations
    FOR EACH ROW
    EXECUTE FUNCTION calculate_location_difficulty();

-- =====================================================
-- 5. MAP PRACTICE SESSIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS map_practice_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Session Configuration
    practice_mode VARCHAR(20) DEFAULT 'practice' CHECK (practice_mode IN ('practice', 'timed', 'speed')),
    question_types TEXT[] DEFAULT ARRAY['map_state'],
    difficulty_range INT[] DEFAULT ARRAY[1, 3], -- [min, max]
    total_questions INT DEFAULT 10,
    time_limit_seconds INT, -- NULL for practice mode
    
    -- Progress Tracking
    questions_answered INT DEFAULT 0,
    correct_answers INT DEFAULT 0,
    total_time_seconds INT DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'exited')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_map_practice_sessions_user ON map_practice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_map_practice_sessions_status ON map_practice_sessions(status);

-- =====================================================
-- 6. MAP PRACTICE ANSWERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS map_practice_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES map_practice_sessions(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    
    -- Answer Data
    answer_type VARCHAR(20) CHECK (answer_type IN ('map_click', 'text', 'multi_click')),
    clicked_regions TEXT[], -- For map_click/multi_click
    clicked_point JSONB, -- { "lat": x, "lng": y } for point questions
    text_answers TEXT[], -- For fill_blank questions
    
    -- Result
    is_correct BOOLEAN DEFAULT false,
    partial_score DECIMAL(3, 2), -- For partial credit (0.0 to 1.0)
    time_taken_seconds INT DEFAULT 0,
    
    answered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_practice_answers_session ON map_practice_answers(session_id);

-- =====================================================
-- 7. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE map_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_practice_answers ENABLE ROW LEVEL SECURITY;

-- Map locations: Everyone can read, only admins can write
CREATE POLICY map_locations_read ON map_locations 
    FOR SELECT USING (true);

CREATE POLICY map_locations_admin ON map_locations 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

-- Map practice sessions: Users can manage their own
CREATE POLICY map_practice_sessions_user ON map_practice_sessions 
    FOR ALL USING (user_id = auth.uid());

-- Map practice answers: Users can manage their own
CREATE POLICY map_practice_answers_user ON map_practice_answers 
    FOR ALL USING (
        session_id IN (SELECT id FROM map_practice_sessions WHERE user_id = auth.uid())
    );

-- =====================================================
-- 8. SEED INDIA COUNTRY AND STATES DATA
-- =====================================================

-- Insert India as country
INSERT INTO map_locations (name, location_type, coordinates, metadata, geojson_feature_id)
VALUES (
    'India', 
    'country', 
    '{"lat": 20.5937, "lng": 78.9629}',
    '{"population": 1428627663, "area_sq_km": 3287263, "capital": "New Delhi"}',
    'IND'
) ON CONFLICT (name, location_type, parent_id) DO NOTHING;

-- Insert all 28 States
INSERT INTO map_locations (name, name_local, location_type, parent_id, coordinates, metadata, alternate_names, geojson_feature_id)
SELECT 
    name, 
    name_local, 
    'state' as location_type,
    (SELECT id FROM map_locations WHERE name = 'India' AND location_type = 'country') as parent_id,
    coordinates::jsonb,
    metadata::jsonb,
    alternate_names,
    geojson_id
FROM (VALUES
    ('Andhra Pradesh', 'ఆంధ్ర ప్రదేశ్', '{"lat": 15.9129, "lng": 79.7400}', '{"population": 49577103, "capital": "Amaravati", "area_sq_km": 162968, "exam_frequency": "high"}', ARRAY['AP'], 'AP'),
    ('Arunachal Pradesh', 'अरुणाचल प्रदेश', '{"lat": 28.2180, "lng": 94.7278}', '{"population": 1383727, "capital": "Itanagar", "area_sq_km": 83743}', ARRAY['AR'], 'AR'),
    ('Assam', 'অসম', '{"lat": 26.2006, "lng": 92.9376}', '{"population": 35607039, "capital": "Dispur", "area_sq_km": 78438, "exam_frequency": "high"}', ARRAY['AS'], 'AS'),
    ('Bihar', 'बिहार', '{"lat": 25.0961, "lng": 85.3131}', '{"population": 124799926, "capital": "Patna", "area_sq_km": 94163, "exam_frequency": "high"}', ARRAY['BR'], 'BR'),
    ('Chhattisgarh', 'छत्तीसगढ़', '{"lat": 21.2787, "lng": 81.8661}', '{"population": 29436231, "capital": "Raipur", "area_sq_km": 135192}', ARRAY['CG', 'Chattisgarh'], 'CG'),
    ('Goa', 'गोंय', '{"lat": 15.2993, "lng": 74.1240}', '{"population": 1586250, "capital": "Panaji", "area_sq_km": 3702, "exam_frequency": "high"}', ARRAY['GA'], 'GA'),
    ('Gujarat', 'ગુજરાત', '{"lat": 22.2587, "lng": 71.1924}', '{"population": 63872399, "capital": "Gandhinagar", "area_sq_km": 196024, "exam_frequency": "high"}', ARRAY['GJ'], 'GJ'),
    ('Haryana', 'हरियाणा', '{"lat": 29.0588, "lng": 76.0856}', '{"population": 28204692, "capital": "Chandigarh", "area_sq_km": 44212, "exam_frequency": "high"}', ARRAY['HR'], 'HR'),
    ('Himachal Pradesh', 'हिमाचल प्रदेश', '{"lat": 31.1048, "lng": 77.1734}', '{"population": 7451955, "capital": "Shimla", "area_sq_km": 55673}', ARRAY['HP'], 'HP'),
    ('Jharkhand', 'झारखण्ड', '{"lat": 23.6102, "lng": 85.2799}', '{"population": 38593948, "capital": "Ranchi", "area_sq_km": 79716}', ARRAY['JH', 'Jharkand'], 'JH'),
    ('Karnataka', 'ಕರ್ನಾಟಕ', '{"lat": 15.3173, "lng": 75.7139}', '{"population": 67562686, "capital": "Bengaluru", "area_sq_km": 191791, "exam_frequency": "high"}', ARRAY['KA', 'Mysore State'], 'KA'),
    ('Kerala', 'കേരളം', '{"lat": 10.8505, "lng": 76.2711}', '{"population": 34697723, "capital": "Thiruvananthapuram", "area_sq_km": 38852, "exam_frequency": "high"}', ARRAY['KL'], 'KL'),
    ('Madhya Pradesh', 'मध्य प्रदेश', '{"lat": 22.9734, "lng": 78.6569}', '{"population": 85358965, "capital": "Bhopal", "area_sq_km": 308252, "exam_frequency": "high"}', ARRAY['MP'], 'MP'),
    ('Maharashtra', 'महाराष्ट्र', '{"lat": 19.7515, "lng": 75.7139}', '{"population": 123144223, "capital": "Mumbai", "area_sq_km": 307713, "exam_frequency": "high"}', ARRAY['MH'], 'MH'),
    ('Manipur', 'মণিপুর', '{"lat": 24.6637, "lng": 93.9063}', '{"population": 3091545, "capital": "Imphal", "area_sq_km": 22327}', ARRAY['MN'], 'MN'),
    ('Meghalaya', 'মেঘালয়', '{"lat": 25.4670, "lng": 91.3662}', '{"population": 3224310, "capital": "Shillong", "area_sq_km": 22429}', ARRAY['ML'], 'ML'),
    ('Mizoram', 'मिज़ोरम', '{"lat": 23.1645, "lng": 92.9376}', '{"population": 1239244, "capital": "Aizawl", "area_sq_km": 21081}', ARRAY['MZ'], 'MZ'),
    ('Nagaland', 'नागालैण्ड', '{"lat": 26.1584, "lng": 94.5624}', '{"population": 2189297, "capital": "Kohima", "area_sq_km": 16579}', ARRAY['NL'], 'NL'),
    ('Odisha', 'ଓଡ଼ିଶା', '{"lat": 20.9517, "lng": 85.0985}', '{"population": 46356334, "capital": "Bhubaneswar", "area_sq_km": 155707, "exam_frequency": "high"}', ARRAY['OR', 'Orissa'], 'OR'),
    ('Punjab', 'ਪੰਜਾਬ', '{"lat": 31.1471, "lng": 75.3412}', '{"population": 30452623, "capital": "Chandigarh", "area_sq_km": 50362, "exam_frequency": "high"}', ARRAY['PB'], 'PB'),
    ('Rajasthan', 'राजस्थान', '{"lat": 27.0238, "lng": 74.2179}', '{"population": 79502477, "capital": "Jaipur", "area_sq_km": 342239, "exam_frequency": "high"}', ARRAY['RJ'], 'RJ'),
    ('Sikkim', 'सिक्किम', '{"lat": 27.5330, "lng": 88.5122}', '{"population": 658019, "capital": "Gangtok", "area_sq_km": 7096}', ARRAY['SK'], 'SK'),
    ('Tamil Nadu', 'தமிழ்நாடு', '{"lat": 11.1271, "lng": 78.6569}', '{"population": 77841267, "capital": "Chennai", "area_sq_km": 130058, "exam_frequency": "high"}', ARRAY['TN', 'Madras State'], 'TN'),
    ('Telangana', 'తెలంగాణ', '{"lat": 18.1124, "lng": 79.0193}', '{"population": 35193978, "capital": "Hyderabad", "area_sq_km": 112077, "exam_frequency": "high"}', ARRAY['TS', 'TG'], 'TS'),
    ('Tripura', 'ত্রিপুরা', '{"lat": 23.9408, "lng": 91.9882}', '{"population": 4169794, "capital": "Agartala", "area_sq_km": 10486}', ARRAY['TR'], 'TR'),
    ('Uttar Pradesh', 'उत्तर प्रदेश', '{"lat": 26.8467, "lng": 80.9462}', '{"population": 231502578, "capital": "Lucknow", "area_sq_km": 240928, "exam_frequency": "high"}', ARRAY['UP'], 'UP'),
    ('Uttarakhand', 'उत्तराखण्ड', '{"lat": 30.0668, "lng": 79.0193}', '{"population": 11250858, "capital": "Dehradun", "area_sq_km": 53483}', ARRAY['UK', 'Uttaranchal'], 'UK'),
    ('West Bengal', 'পশ্চিমবঙ্গ', '{"lat": 22.9868, "lng": 87.8550}', '{"population": 99609303, "capital": "Kolkata", "area_sq_km": 88752, "exam_frequency": "high"}', ARRAY['WB', 'Bengal'], 'WB')
) AS states(name, name_local, coordinates, metadata, alternate_names, geojson_id)
ON CONFLICT (name, location_type, parent_id) DO NOTHING;

-- Insert all 8 Union Territories
INSERT INTO map_locations (name, name_local, location_type, parent_id, coordinates, metadata, alternate_names, geojson_feature_id)
SELECT 
    name, 
    name_local, 
    'ut' as location_type,
    (SELECT id FROM map_locations WHERE name = 'India' AND location_type = 'country') as parent_id,
    coordinates::jsonb,
    metadata::jsonb,
    alternate_names,
    geojson_id
FROM (VALUES
    ('Andaman and Nicobar Islands', 'अंडमान और निकोबार द्वीपसमूह', '{"lat": 11.7401, "lng": 92.6586}', '{"population": 380581, "capital": "Port Blair", "area_sq_km": 8249}', ARRAY['AN', 'Andaman Nicobar', 'A&N'], 'AN'),
    ('Chandigarh', 'चंडीगढ़', '{"lat": 30.7333, "lng": 76.7794}', '{"population": 1158473, "capital": "Chandigarh", "area_sq_km": 114, "exam_frequency": "high"}', ARRAY['CH'], 'CH'),
    ('Dadra and Nagar Haveli and Daman and Diu', 'दादरा और नगर हवेली और दमन और दीव', '{"lat": 20.1809, "lng": 73.0169}', '{"population": 615724, "capital": "Daman", "area_sq_km": 603}', ARRAY['DN', 'DD', 'DNH'], 'DD'),
    ('Delhi', 'दिल्ली', '{"lat": 28.7041, "lng": 77.1025}', '{"population": 19814000, "capital": "New Delhi", "area_sq_km": 1484, "exam_frequency": "high"}', ARRAY['DL', 'NCT', 'New Delhi', 'NCR'], 'DL'),
    ('Jammu and Kashmir', 'जम्मू और कश्मीर', '{"lat": 33.7782, "lng": 76.5762}', '{"population": 13606320, "capital": "Srinagar", "area_sq_km": 55538, "exam_frequency": "high"}', ARRAY['JK', 'J&K', 'Kashmir'], 'JK'),
    ('Ladakh', 'ལ་དྭགས', '{"lat": 34.1526, "lng": 77.5771}', '{"population": 274289, "capital": "Leh", "area_sq_km": 59146}', ARRAY['LA'], 'LA'),
    ('Lakshadweep', 'ലക്ഷദ്വീപ്', '{"lat": 10.5667, "lng": 72.6417}', '{"population": 68863, "capital": "Kavaratti", "area_sq_km": 32}', ARRAY['LD'], 'LD'),
    ('Puducherry', 'புதுச்சேரி', '{"lat": 11.9416, "lng": 79.8083}', '{"population": 1413542, "capital": "Puducherry", "area_sq_km": 479, "exam_frequency": "high"}', ARRAY['PY', 'Pondicherry'], 'PY')
) AS uts(name, name_local, coordinates, metadata, alternate_names, geojson_id)
ON CONFLICT (name, location_type, parent_id) DO NOTHING;

-- Update state_id for all states/UTs (self-reference for top-level)
UPDATE map_locations 
SET state_id = id 
WHERE location_type IN ('state', 'ut');

-- =====================================================
-- 9. SEED SOME POPULAR NATIONAL PARKS
-- =====================================================

-- Get state IDs for reference
DO $$
DECLARE
    uttarakhand_id UUID;
    assam_id UUID;
    rajasthan_id UUID;
    mp_id UUID;
    karnataka_id UUID;
    wb_id UUID;
BEGIN
    SELECT id INTO uttarakhand_id FROM map_locations WHERE name = 'Uttarakhand' AND location_type = 'state';
    SELECT id INTO assam_id FROM map_locations WHERE name = 'Assam' AND location_type = 'state';
    SELECT id INTO rajasthan_id FROM map_locations WHERE name = 'Rajasthan' AND location_type = 'state';
    SELECT id INTO mp_id FROM map_locations WHERE name = 'Madhya Pradesh' AND location_type = 'state';
    SELECT id INTO karnataka_id FROM map_locations WHERE name = 'Karnataka' AND location_type = 'state';
    SELECT id INTO wb_id FROM map_locations WHERE name = 'West Bengal' AND location_type = 'state';
    
    -- Insert National Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
        ('Jim Corbett National Park', 'national_park', uttarakhand_id, uttarakhand_id, 
         '{"lat": 29.5300, "lng": 78.7747}', 
         '{"established": 1936, "area_sq_km": 520.82, "famous_for": ["Tiger Reserve", "Oldest National Park"], "exam_frequency": "high"}',
         ARRAY['Corbett', 'Jim Corbett']),
        
        ('Kaziranga National Park', 'national_park', assam_id, assam_id, 
         '{"lat": 26.5775, "lng": 93.1711}', 
         '{"established": 1974, "area_sq_km": 430, "famous_for": ["One-horned Rhinoceros", "UNESCO World Heritage"], "exam_frequency": "high"}',
         ARRAY['Kaziranga']),
        
        ('Ranthambore National Park', 'national_park', rajasthan_id, rajasthan_id, 
         '{"lat": 26.0173, "lng": 76.5026}', 
         '{"established": 1980, "area_sq_km": 392, "famous_for": ["Bengal Tigers", "Ranthambore Fort"], "exam_frequency": "high"}',
         ARRAY['Ranthambore', 'Ranthambhore']),
        
        ('Bandhavgarh National Park', 'national_park', mp_id, mp_id, 
         '{"lat": 23.7217, "lng": 81.0369}', 
         '{"established": 1968, "area_sq_km": 448.85, "famous_for": ["Highest Tiger Density", "White Tigers"], "exam_frequency": "high"}',
         ARRAY['Bandhavgarh']),
        
        ('Kanha National Park', 'national_park', mp_id, mp_id, 
         '{"lat": 22.3349, "lng": 80.6115}', 
         '{"established": 1955, "area_sq_km": 940, "famous_for": ["Barasingha", "Inspiration for Jungle Book"], "exam_frequency": "high"}',
         ARRAY['Kanha']),
        
        ('Bandipur National Park', 'national_park', karnataka_id, karnataka_id, 
         '{"lat": 11.6693, "lng": 76.6331}', 
         '{"established": 1974, "area_sq_km": 874.2, "famous_for": ["Nilgiri Biosphere Reserve", "Asian Elephants"], "exam_frequency": "medium"}',
         ARRAY['Bandipur']),
        
        ('Sundarbans National Park', 'national_park', wb_id, wb_id, 
         '{"lat": 21.9497, "lng": 89.1833}', 
         '{"established": 1984, "area_sq_km": 1330.12, "famous_for": ["Mangrove Forest", "Royal Bengal Tiger", "UNESCO World Heritage"], "exam_frequency": "high"}',
         ARRAY['Sundarbans', 'Sundarban'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;
END $$;

-- =====================================================
-- 10. SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Map Practice Migration completed successfully!';
    RAISE NOTICE 'Created/Updated:';
    RAISE NOTICE '  - questions.question_type column';
    RAISE NOTICE '  - questions.map_data column';
    RAISE NOTICE '  - questions.blank_data column';
    RAISE NOTICE '  - map_locations table with difficulty auto-calc trigger';
    RAISE NOTICE '  - map_practice_sessions table';
    RAISE NOTICE '  - map_practice_answers table';
    RAISE NOTICE '  - Seeded India + 28 States + 8 UTs + 7 National Parks';
END $$;
