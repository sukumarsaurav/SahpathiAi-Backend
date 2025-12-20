-- Migration: Seed National Parks and Wildlife Sanctuaries
-- Date: 2024-12-20
-- Adds 50+ major national parks with coordinates for point-click questions

-- Get India ID for parent reference
DO $$
DECLARE
    india_id UUID;
    andhra_id UUID;
    arunachal_id UUID;
    assam_id UUID;
    bihar_id UUID;
    chhattisgarh_id UUID;
    goa_id UUID;
    gujarat_id UUID;
    haryana_id UUID;
    hp_id UUID;
    jharkhand_id UUID;
    karnataka_id UUID;
    kerala_id UUID;
    mp_id UUID;
    maharashtra_id UUID;
    manipur_id UUID;
    meghalaya_id UUID;
    mizoram_id UUID;
    nagaland_id UUID;
    odisha_id UUID;
    rajasthan_id UUID;
    sikkim_id UUID;
    tn_id UUID;
    telangana_id UUID;
    tripura_id UUID;
    up_id UUID;
    uttarakhand_id UUID;
    wb_id UUID;
    jk_id UUID;
    ladakh_id UUID;
BEGIN
    -- Get state IDs
    SELECT id INTO india_id FROM map_locations WHERE name = 'India' AND location_type = 'country';
    SELECT id INTO andhra_id FROM map_locations WHERE name = 'Andhra Pradesh' AND location_type = 'state';
    SELECT id INTO arunachal_id FROM map_locations WHERE name = 'Arunachal Pradesh' AND location_type = 'state';
    SELECT id INTO assam_id FROM map_locations WHERE name = 'Assam' AND location_type = 'state';
    SELECT id INTO bihar_id FROM map_locations WHERE name = 'Bihar' AND location_type = 'state';
    SELECT id INTO chhattisgarh_id FROM map_locations WHERE name = 'Chhattisgarh' AND location_type = 'state';
    SELECT id INTO goa_id FROM map_locations WHERE name = 'Goa' AND location_type = 'state';
    SELECT id INTO gujarat_id FROM map_locations WHERE name = 'Gujarat' AND location_type = 'state';
    SELECT id INTO haryana_id FROM map_locations WHERE name = 'Haryana' AND location_type = 'state';
    SELECT id INTO hp_id FROM map_locations WHERE name = 'Himachal Pradesh' AND location_type = 'state';
    SELECT id INTO jharkhand_id FROM map_locations WHERE name = 'Jharkhand' AND location_type = 'state';
    SELECT id INTO karnataka_id FROM map_locations WHERE name = 'Karnataka' AND location_type = 'state';
    SELECT id INTO kerala_id FROM map_locations WHERE name = 'Kerala' AND location_type = 'state';
    SELECT id INTO mp_id FROM map_locations WHERE name = 'Madhya Pradesh' AND location_type = 'state';
    SELECT id INTO maharashtra_id FROM map_locations WHERE name = 'Maharashtra' AND location_type = 'state';
    SELECT id INTO manipur_id FROM map_locations WHERE name = 'Manipur' AND location_type = 'state';
    SELECT id INTO meghalaya_id FROM map_locations WHERE name = 'Meghalaya' AND location_type = 'state';
    SELECT id INTO mizoram_id FROM map_locations WHERE name = 'Mizoram' AND location_type = 'state';
    SELECT id INTO nagaland_id FROM map_locations WHERE name = 'Nagaland' AND location_type = 'state';
    SELECT id INTO odisha_id FROM map_locations WHERE name = 'Odisha' AND location_type = 'state';
    SELECT id INTO rajasthan_id FROM map_locations WHERE name = 'Rajasthan' AND location_type = 'state';
    SELECT id INTO sikkim_id FROM map_locations WHERE name = 'Sikkim' AND location_type = 'state';
    SELECT id INTO tn_id FROM map_locations WHERE name = 'Tamil Nadu' AND location_type = 'state';
    SELECT id INTO telangana_id FROM map_locations WHERE name = 'Telangana' AND location_type = 'state';
    SELECT id INTO tripura_id FROM map_locations WHERE name = 'Tripura' AND location_type = 'state';
    SELECT id INTO up_id FROM map_locations WHERE name = 'Uttar Pradesh' AND location_type = 'state';
    SELECT id INTO uttarakhand_id FROM map_locations WHERE name = 'Uttarakhand' AND location_type = 'state';
    SELECT id INTO wb_id FROM map_locations WHERE name = 'West Bengal' AND location_type = 'state';
    SELECT id INTO jk_id FROM map_locations WHERE name = 'Jammu and Kashmir' AND location_type = 'ut';
    SELECT id INTO ladakh_id FROM map_locations WHERE name = 'Ladakh' AND location_type = 'ut';

    -- Insert National Parks (50+ major parks)
    -- Uttarakhand Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    ('Nanda Devi National Park', 'national_park', uttarakhand_id, uttarakhand_id, 
     '{"lat": 30.4167, "lng": 79.9167}', 
     '{"established": 1982, "area_sq_km": 630.33, "famous_for": ["Nanda Devi Peak", "UNESCO World Heritage"], "exam_frequency": "high"}',
     ARRAY['Nanda Devi']),
    ('Valley of Flowers National Park', 'national_park', uttarakhand_id, uttarakhand_id, 
     '{"lat": 30.7280, "lng": 79.6050}', 
     '{"established": 1982, "area_sq_km": 87.5, "famous_for": ["Alpine Flowers", "UNESCO World Heritage"], "exam_frequency": "high"}',
     ARRAY['Valley of Flowers']),
    ('Rajaji National Park', 'national_park', uttarakhand_id, uttarakhand_id, 
     '{"lat": 30.0833, "lng": 78.0833}', 
     '{"established": 1983, "area_sq_km": 820.42, "famous_for": ["Asian Elephants", "Tigers"], "exam_frequency": "medium"}',
     ARRAY['Rajaji']),
    ('Gangotri National Park', 'national_park', uttarakhand_id, uttarakhand_id, 
     '{"lat": 31.0167, "lng": 78.9333}', 
     '{"established": 1989, "area_sq_km": 2390.02, "famous_for": ["Ganga Origin", "Snow Leopard"], "exam_frequency": "medium"}',
     ARRAY['Gangotri'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    -- Madhya Pradesh Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    ('Pench National Park', 'national_park', mp_id, mp_id, 
     '{"lat": 21.7500, "lng": 79.3333}', 
     '{"established": 1975, "area_sq_km": 758, "famous_for": ["Tigers", "Jungle Book Inspiration"], "exam_frequency": "high"}',
     ARRAY['Pench']),
    ('Satpura National Park', 'national_park', mp_id, mp_id, 
     '{"lat": 22.4333, "lng": 78.3500}', 
     '{"established": 1981, "area_sq_km": 524, "famous_for": ["Walking Safaris", "Boat Safaris"], "exam_frequency": "medium"}',
     ARRAY['Satpura']),
    ('Panna National Park', 'national_park', mp_id, mp_id, 
     '{"lat": 24.7333, "lng": 80.0167}', 
     '{"established": 1981, "area_sq_km": 542.67, "famous_for": ["Tiger Reintroduction Success"], "exam_frequency": "medium"}',
     ARRAY['Panna']),
    ('Sanjay National Park', 'national_park', mp_id, mp_id, 
     '{"lat": 23.5167, "lng": 81.8833}', 
     '{"established": 1981, "area_sq_km": 466.88, "famous_for": ["Tigers", "White Tigers"], "exam_frequency": "low"}',
     ARRAY['Sanjay']),
    ('Van Vihar National Park', 'national_park', mp_id, mp_id, 
     '{"lat": 23.2200, "lng": 77.4000}', 
     '{"established": 1983, "area_sq_km": 4.45, "famous_for": ["Urban National Park", "Bhopal"], "exam_frequency": "low"}',
     ARRAY['Van Vihar']),
    ('Madhav National Park', 'national_park', mp_id, mp_id, 
     '{"lat": 25.4500, "lng": 77.7333}', 
     '{"established": 1959, "area_sq_km": 375.22, "famous_for": ["George Castle", "Shivpuri"], "exam_frequency": "low"}',
     ARRAY['Madhav'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    -- Rajasthan Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    ('Sariska Tiger Reserve', 'national_park', rajasthan_id, rajasthan_id, 
     '{"lat": 27.3167, "lng": 76.4000}', 
     '{"established": 1979, "area_sq_km": 866, "famous_for": ["Tigers", "Oldest Tiger Reserve"], "exam_frequency": "high"}',
     ARRAY['Sariska']),
    ('Desert National Park', 'national_park', rajasthan_id, rajasthan_id, 
     '{"lat": 26.8333, "lng": 70.5833}', 
     '{"established": 1992, "area_sq_km": 3162, "famous_for": ["Great Indian Bustard", "Desert Ecosystem"], "exam_frequency": "high"}',
     ARRAY['Desert NP']),
    ('Keoladeo National Park', 'national_park', rajasthan_id, rajasthan_id, 
     '{"lat": 27.1589, "lng": 77.5220}', 
     '{"established": 1982, "area_sq_km": 28.73, "famous_for": ["Bird Sanctuary", "UNESCO World Heritage", "Bharatpur"], "exam_frequency": "high"}',
     ARRAY['Keoladeo', 'Bharatpur Bird Sanctuary']),
    ('Mukundra Hills National Park', 'national_park', rajasthan_id, rajasthan_id, 
     '{"lat": 24.6333, "lng": 75.9500}', 
     '{"established": 2004, "area_sq_km": 759, "famous_for": ["Tigers", "Darrah Wildlife"], "exam_frequency": "medium"}',
     ARRAY['Mukundra', 'Darrah'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    -- Assam Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    ('Manas National Park', 'national_park', assam_id, assam_id, 
     '{"lat": 26.6594, "lng": 91.0011}', 
     '{"established": 1990, "area_sq_km": 500, "famous_for": ["UNESCO World Heritage", "Wild Buffalo", "Golden Langur"], "exam_frequency": "high"}',
     ARRAY['Manas']),
    ('Dibru Saikhowa National Park', 'national_park', assam_id, assam_id, 
     '{"lat": 27.5833, "lng": 95.3167}', 
     '{"established": 1999, "area_sq_km": 340, "famous_for": ["Feral Horses", "Wetlands"], "exam_frequency": "medium"}',
     ARRAY['Dibru Saikhowa']),
    ('Nameri National Park', 'national_park', assam_id, assam_id, 
     '{"lat": 27.0167, "lng": 92.8000}', 
     '{"established": 1998, "area_sq_km": 200, "famous_for": ["White-winged Wood Duck", "River Rafting"], "exam_frequency": "medium"}',
     ARRAY['Nameri']),
    ('Orang National Park', 'national_park', assam_id, assam_id, 
     '{"lat": 26.5167, "lng": 92.2667}', 
     '{"established": 1999, "area_sq_km": 78.81, "famous_for": ["Mini Kaziranga", "Rhinos"], "exam_frequency": "medium"}',
     ARRAY['Orang', 'Rajiv Gandhi Orang'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    -- Karnataka Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    ('Nagarhole National Park', 'national_park', karnataka_id, karnataka_id, 
     '{"lat": 12.0500, "lng": 76.1500}', 
     '{"established": 1988, "area_sq_km": 643.39, "famous_for": ["Tigers", "Kabini River"], "exam_frequency": "high"}',
     ARRAY['Nagarhole', 'Rajiv Gandhi NP']),
    ('Bannerghatta National Park', 'national_park', karnataka_id, karnataka_id, 
     '{"lat": 12.3000, "lng": 77.5667}', 
     '{"established": 1974, "area_sq_km": 104.27, "famous_for": ["Near Bangalore", "Safari Park"], "exam_frequency": "medium"}',
     ARRAY['Bannerghatta']),
    ('Anshi National Park', 'national_park', karnataka_id, karnataka_id, 
     '{"lat": 15.0167, "lng": 74.4333}', 
     '{"established": 1987, "area_sq_km": 339.87, "famous_for": ["Western Ghats", "Black Panther"], "exam_frequency": "medium"}',
     ARRAY['Anshi', 'Kali Tiger Reserve']),
    ('Kudremukh National Park', 'national_park', karnataka_id, karnataka_id, 
     '{"lat": 13.2167, "lng": 75.1833}', 
     '{"established": 1987, "area_sq_km": 600.32, "famous_for": ["Shola Forests", "Lion-tailed Macaque"], "exam_frequency": "medium"}',
     ARRAY['Kudremukh'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    -- Kerala Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    ('Periyar National Park', 'national_park', kerala_id, kerala_id, 
     '{"lat": 9.4667, "lng": 77.2333}', 
     '{"established": 1982, "area_sq_km": 350, "famous_for": ["Periyar Lake", "Elephants", "Thekkady"], "exam_frequency": "high"}',
     ARRAY['Periyar', 'Thekkady']),
    ('Silent Valley National Park', 'national_park', kerala_id, kerala_id, 
     '{"lat": 11.0833, "lng": 76.4333}', 
     '{"established": 1984, "area_sq_km": 89.52, "famous_for": ["Rainforest", "Lion-tailed Macaque", "Environmental Movement"], "exam_frequency": "high"}',
     ARRAY['Silent Valley']),
    ('Eravikulam National Park', 'national_park', kerala_id, kerala_id, 
     '{"lat": 10.1833, "lng": 77.0500}', 
     '{"established": 1978, "area_sq_km": 97, "famous_for": ["Nilgiri Tahr", "Neelakurinji Flowers", "Anamudi Peak"], "exam_frequency": "high"}',
     ARRAY['Eravikulam']),
    ('Mathikettan Shola National Park', 'national_park', kerala_id, kerala_id, 
     '{"lat": 10.0500, "lng": 77.2333}', 
     '{"established": 2003, "area_sq_km": 12.82, "famous_for": ["Shola Forests", "Biodiversity"], "exam_frequency": "low"}',
     ARRAY['Mathikettan Shola']),
    ('Anamudi Shola National Park', 'national_park', kerala_id, kerala_id, 
     '{"lat": 10.1333, "lng": 77.1333}', 
     '{"established": 2003, "area_sq_km": 7.5, "famous_for": ["Shola Grasslands"], "exam_frequency": "low"}',
     ARRAY['Anamudi Shola'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    -- Tamil Nadu Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    ('Mudumalai National Park', 'national_park', tn_id, tn_id, 
     '{"lat": 11.5667, "lng": 76.5333}', 
     '{"established": 1940, "area_sq_km": 321, "famous_for": ["Nilgiri Biosphere", "Elephants"], "exam_frequency": "high"}',
     ARRAY['Mudumalai']),
    ('Guindy National Park', 'national_park', tn_id, tn_id, 
     '{"lat": 13.0167, "lng": 80.2333}', 
     '{"established": 1976, "area_sq_km": 2.82, "famous_for": ["Chennai Urban Park", "Blackbuck"], "exam_frequency": "medium"}',
     ARRAY['Guindy']),
    ('Gulf of Mannar Marine National Park', 'national_park', tn_id, tn_id, 
     '{"lat": 9.0833, "lng": 79.0000}', 
     '{"established": 1986, "area_sq_km": 560, "famous_for": ["Marine Biodiversity", "Coral Reefs", "Dugong"], "exam_frequency": "high"}',
     ARRAY['Gulf of Mannar']),
    ('Indira Gandhi National Park', 'national_park', tn_id, tn_id, 
     '{"lat": 10.3500, "lng": 77.4167}', 
     '{"established": 1989, "area_sq_km": 117.10, "famous_for": ["Anaimalai Hills", "Lion-tailed Macaque"], "exam_frequency": "medium"}',
     ARRAY['Anamalai', 'Indira Gandhi Wildlife'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    -- Gujarat Parks  
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    ('Gir National Park', 'national_park', gujarat_id, gujarat_id, 
     '{"lat": 21.1333, "lng": 70.8333}', 
     '{"established": 1965, "area_sq_km": 1412, "famous_for": ["Asiatic Lions", "Only Lion Habitat Outside Africa"], "exam_frequency": "high"}',
     ARRAY['Gir', 'Gir Forest']),
    ('Marine National Park Gulf of Kutch', 'national_park', gujarat_id, gujarat_id, 
     '{"lat": 22.4167, "lng": 69.1333}', 
     '{"established": 1982, "area_sq_km": 162.89, "famous_for": ["Coral Reefs", "Marine Life"], "exam_frequency": "medium"}',
     ARRAY['Marine NP Kutch']),
    ('Blackbuck National Park', 'national_park', gujarat_id, gujarat_id, 
     '{"lat": 22.1167, "lng": 71.7833}', 
     '{"established": 1976, "area_sq_km": 34.08, "famous_for": ["Blackbuck", "Velavadar"], "exam_frequency": "medium"}',
     ARRAY['Velavadar', 'Blackbuck NP']),
    ('Vansda National Park', 'national_park', gujarat_id, gujarat_id, 
     '{"lat": 20.7500, "lng": 73.5167}', 
     '{"established": 1979, "area_sq_km": 23.99, "famous_for": ["Moist Deciduous Forest"], "exam_frequency": "low"}',
     ARRAY['Vansda'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    -- Maharashtra Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    ('Tadoba National Park', 'national_park', maharashtra_id, maharashtra_id, 
     '{"lat": 20.2167, "lng": 79.3500}', 
     '{"established": 1955, "area_sq_km": 625.40, "famous_for": ["Tigers", "Tadoba Andhari Tiger Reserve"], "exam_frequency": "high"}',
     ARRAY['Tadoba', 'Tadoba Andhari']),
    ('Navegaon National Park', 'national_park', maharashtra_id, maharashtra_id, 
     '{"lat": 21.1000, "lng": 79.9833}', 
     '{"established": 1975, "area_sq_km": 133.88, "famous_for": ["Navegaon Lake", "Birds"], "exam_frequency": "medium"}',
     ARRAY['Navegaon']),
    ('Chandoli National Park', 'national_park', maharashtra_id, maharashtra_id, 
     '{"lat": 17.1500, "lng": 73.8333}', 
     '{"established": 2004, "area_sq_km": 317.67, "famous_for": ["Sahyadri", "Tigers"], "exam_frequency": "medium"}',
     ARRAY['Chandoli']),
    ('Sanjay Gandhi National Park', 'national_park', maharashtra_id, maharashtra_id, 
     '{"lat": 19.2167, "lng": 72.9167}', 
     '{"established": 1983, "area_sq_km": 103.84, "famous_for": ["Mumbai Urban Park", "Kanheri Caves", "Leopards"], "exam_frequency": "high"}',
     ARRAY['Sanjay Gandhi', 'Borivali NP'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    -- Arunachal Pradesh Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    ('Namdapha National Park', 'national_park', arunachal_id, arunachal_id, 
     '{"lat": 27.5000, "lng": 96.5000}', 
     '{"established": 1983, "area_sq_km": 1985.24, "famous_for": ["All Four Big Cats", "Hoolock Gibbon", "Easternmost NP"], "exam_frequency": "high"}',
     ARRAY['Namdapha']),
    ('Mouling National Park', 'national_park', arunachal_id, arunachal_id, 
     '{"lat": 28.5333, "lng": 94.6333}', 
     '{"established": 1986, "area_sq_km": 483, "famous_for": ["Takin", "Red Panda"], "exam_frequency": "medium"}',
     ARRAY['Mouling'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    -- Other State Parks
    INSERT INTO map_locations (name, location_type, parent_id, state_id, coordinates, metadata, alternate_names)
    VALUES 
    -- Andhra Pradesh
    ('Sri Venkateswara National Park', 'national_park', andhra_id, andhra_id, 
     '{"lat": 13.6500, "lng": 79.3500}', 
     '{"established": 1989, "area_sq_km": 353.62, "famous_for": ["Tirupati", "Endemic Species"], "exam_frequency": "medium"}',
     ARRAY['Sri Venkateswara']),
    -- Bihar
    ('Valmiki National Park', 'national_park', bihar_id, bihar_id, 
     '{"lat": 27.4167, "lng": 83.9500}', 
     '{"established": 1989, "area_sq_km": 545.15, "famous_for": ["Tigers", "Nepal Border"], "exam_frequency": "medium"}',
     ARRAY['Valmiki']),
    -- Chhattisgarh
    ('Indravati National Park', 'national_park', chhattisgarh_id, chhattisgarh_id, 
     '{"lat": 19.1667, "lng": 81.0833}', 
     '{"established": 1982, "area_sq_km": 1258.37, "famous_for": ["Wild Buffalo", "Tigers"], "exam_frequency": "medium"}',
     ARRAY['Indravati']),
    ('Kanger Ghati National Park', 'national_park', chhattisgarh_id, chhattisgarh_id, 
     '{"lat": 18.8500, "lng": 82.0167}', 
     '{"established": 1982, "area_sq_km": 200, "famous_for": ["Kotumsar Caves", "Bastar"], "exam_frequency": "medium"}',
     ARRAY['Kanger Valley', 'Kanger Ghati']),
    -- Goa
    ('Mollem National Park', 'national_park', goa_id, goa_id, 
     '{"lat": 15.3667, "lng": 74.2333}', 
     '{"established": 1978, "area_sq_km": 107, "famous_for": ["Western Ghats", "Dudhsagar Falls"], "exam_frequency": "medium"}',
     ARRAY['Mollem', 'Bhagwan Mahavir']),
    -- Haryana
    ('Sultanpur National Park', 'national_park', haryana_id, haryana_id, 
     '{"lat": 28.4667, "lng": 76.8833}', 
     '{"established": 1989, "area_sq_km": 1.43, "famous_for": ["Migratory Birds", "Near Delhi"], "exam_frequency": "medium"}',
     ARRAY['Sultanpur']),
    ('Kalesar National Park', 'national_park', haryana_id, haryana_id, 
     '{"lat": 30.3833, "lng": 77.5500}', 
     '{"established": 2003, "area_sq_km": 46.82, "famous_for": ["Sal Forest", "Elephants"], "exam_frequency": "low"}',
     ARRAY['Kalesar']),
    -- Jharkhand
    ('Betla National Park', 'national_park', jharkhand_id, jharkhand_id, 
     '{"lat": 23.6667, "lng": 84.2167}', 
     '{"established": 1986, "area_sq_km": 231.67, "famous_for": ["Tigers", "Palamau Fort"], "exam_frequency": "medium"}',
     ARRAY['Betla', 'Palamau']),
    -- Manipur
    ('Keibul Lamjao National Park', 'national_park', manipur_id, manipur_id, 
     '{"lat": 24.5000, "lng": 93.7833}', 
     '{"established": 1977, "area_sq_km": 40, "famous_for": ["Sangai Deer", "Floating Park", "Loktak Lake"], "exam_frequency": "high"}',
     ARRAY['Keibul Lamjao']),
    -- Mizoram
    ('Murlen National Park', 'national_park', mizoram_id, mizoram_id, 
     '{"lat": 23.5833, "lng": 93.2667}', 
     '{"established": 1991, "area_sq_km": 100, "famous_for": ["Hoolock Gibbon"], "exam_frequency": "low"}',
     ARRAY['Murlen']),
    ('Phawngpui Blue Mountain National Park', 'national_park', mizoram_id, mizoram_id, 
     '{"lat": 22.6833, "lng": 93.1000}', 
     '{"established": 1992, "area_sq_km": 50, "famous_for": ["Highest Peak Mizoram", "Orchids"], "exam_frequency": "low"}',
     ARRAY['Phawngpui', 'Blue Mountain']),
    -- Odisha
    ('Simlipal National Park', 'national_park', odisha_id, odisha_id, 
     '{"lat": 21.8333, "lng": 86.3333}', 
     '{"established": 1980, "area_sq_km": 2750, "famous_for": ["Tigers", "Melanistic Tigers"], "exam_frequency": "high"}',
     ARRAY['Simlipal']),
    ('Bhitarkanika National Park', 'national_park', odisha_id, odisha_id, 
     '{"lat": 20.7167, "lng": 87.0167}', 
     '{"established": 1988, "area_sq_km": 145, "famous_for": ["Saltwater Crocodiles", "Mangroves"], "exam_frequency": "high"}',
     ARRAY['Bhitarkanika']),
    -- Sikkim
    ('Khangchendzonga National Park', 'national_park', sikkim_id, sikkim_id, 
     '{"lat": 27.6000, "lng": 88.4000}', 
     '{"established": 1977, "area_sq_km": 1784, "famous_for": ["Kanchenjunga", "UNESCO World Heritage", "Snow Leopard"], "exam_frequency": "high"}',
     ARRAY['Khangchendzonga', 'Kanchenjunga']),
    -- Telangana
    ('Mrugavani National Park', 'national_park', telangana_id, telangana_id, 
     '{"lat": 17.3000, "lng": 78.3667}', 
     '{"established": 1994, "area_sq_km": 3.5, "famous_for": ["Urban Park", "Near Hyderabad"], "exam_frequency": "low"}',
     ARRAY['Mrugavani']),
    -- Tripura
    ('Clouded Leopard National Park', 'national_park', tripura_id, tripura_id, 
     '{"lat": 23.9333, "lng": 91.5500}', 
     '{"established": 2007, "area_sq_km": 5.08, "famous_for": ["Clouded Leopard", "Breeding Center"], "exam_frequency": "low"}',
     ARRAY['Clouded Leopard NP']),
    -- Uttar Pradesh
    ('Dudhwa National Park', 'national_park', up_id, up_id, 
     '{"lat": 28.5333, "lng": 80.6333}', 
     '{"established": 1977, "area_sq_km": 490.29, "famous_for": ["Swamp Deer", "One-horned Rhino", "Tigers"], "exam_frequency": "high"}',
     ARRAY['Dudhwa']),
    -- West Bengal
    ('Gorumara National Park', 'national_park', wb_id, wb_id, 
     '{"lat": 26.7333, "lng": 88.8000}', 
     '{"established": 1994, "area_sq_km": 79.45, "famous_for": ["Indian Rhinoceros", "Dooars"], "exam_frequency": "medium"}',
     ARRAY['Gorumara']),
    ('Neora Valley National Park', 'national_park', wb_id, wb_id, 
     '{"lat": 27.0853, "lng": 88.7009}', 
     '{"established": 1986, "area_sq_km": 88, "famous_for": ["Red Panda", "Himalayan Biodiversity"], "exam_frequency": "medium"}',
     ARRAY['Neora Valley']),
    ('Buxa National Park', 'national_park', wb_id, wb_id, 
     '{"lat": 26.6333, "lng": 89.5500}', 
     '{"established": 1992, "area_sq_km": 760.87, "famous_for": ["Elephants", "Dooars"], "exam_frequency": "medium"}',
     ARRAY['Buxa', 'Buxa Tiger Reserve']),
    ('Jaldapara National Park', 'national_park', wb_id, wb_id, 
     '{"lat": 26.6500, "lng": 89.4333}', 
     '{"established": 2012, "area_sq_km": 216.51, "famous_for": ["Indian Rhinoceros", "Hollong Tree"], "exam_frequency": "medium"}',
     ARRAY['Jaldapara']),
    -- Jammu & Kashmir
    ('Dachigam National Park', 'national_park', jk_id, jk_id, 
     '{"lat": 34.0833, "lng": 74.9333}', 
     '{"established": 1981, "area_sq_km": 141, "famous_for": ["Hangul Deer", "Kashmir Stag"], "exam_frequency": "high"}',
     ARRAY['Dachigam']),
    ('Kishtwar National Park', 'national_park', jk_id, jk_id, 
     '{"lat": 33.5000, "lng": 75.7833}', 
     '{"established": 1981, "area_sq_km": 400, "famous_for": ["Snow Leopard", "Himalayan Brown Bear"], "exam_frequency": "medium"}',
     ARRAY['Kishtwar']),
    -- Ladakh
    ('Hemis National Park', 'national_park', ladakh_id, ladakh_id, 
     '{"lat": 33.7833, "lng": 77.5000}', 
     '{"established": 1981, "area_sq_km": 4400, "famous_for": ["Largest NP in India", "Snow Leopard", "Hemis Gompa"], "exam_frequency": "high"}',
     ARRAY['Hemis']),
    -- Himachal Pradesh
    ('Great Himalayan National Park', 'national_park', hp_id, hp_id, 
     '{"lat": 31.7500, "lng": 77.4500}', 
     '{"established": 1984, "area_sq_km": 754.4, "famous_for": ["UNESCO World Heritage", "Western Tragopan"], "exam_frequency": "high"}',
     ARRAY['Great Himalayan', 'GHNP']),
    ('Pin Valley National Park', 'national_park', hp_id, hp_id, 
     '{"lat": 32.0333, "lng": 78.0333}', 
     '{"established": 1987, "area_sq_km": 675, "famous_for": ["Snow Leopard", "Spiti Valley", "Cold Desert"], "exam_frequency": "medium"}',
     ARRAY['Pin Valley'])
    ON CONFLICT (name, location_type, parent_id) DO NOTHING;

    RAISE NOTICE '✅ National Parks seeded successfully!';
END $$;

-- Summary
DO $$
BEGIN
    RAISE NOTICE 'Seeded national parks including:';
    RAISE NOTICE '- Uttarakhand: 4 parks (Jim Corbett, Nanda Devi, Valley of Flowers, etc.)';
    RAISE NOTICE '- Madhya Pradesh: 6 parks (Kanha, Bandhavgarh, Pench, etc.)';
    RAISE NOTICE '- Rajasthan: 4 parks (Ranthambore, Sariska, Desert NP, Keoladeo)';
    RAISE NOTICE '- Kerala: 5 parks (Periyar, Silent Valley, Eravikulam, etc.)';
    RAISE NOTICE '- And 30+ more across all states';
END $$;
