
export const SEED_DATA = {
    examCategories: [
        { name: 'Competitive Exams', description: 'Entrance exams for colleges and jobs', icon: 'award', display_order: 1 },
        { name: 'School Board Exams', description: 'Class 10th and 12th Board Exams', icon: 'book', display_order: 2 },
        { name: 'Government Jobs', description: 'SSC, Banking, Railways, etc.', icon: 'briefcase', display_order: 3 }
    ],
    exams: [
        { name: 'JEE Main', short_name: 'JEE', description: 'Joint Entrance Examination for Engineering', category_name: 'Competitive Exams' },
        { name: 'NEET', short_name: 'NEET', description: 'National Eligibility cum Entrance Test for Medical', category_name: 'Competitive Exams' },
        { name: 'CBSE Class 10', short_name: 'CBSE 10', description: 'Central Board of Secondary Education Class 10', category_name: 'School Board Exams' },
        { name: 'SSC CGL', short_name: 'SSC CGL', description: 'Staff Selection Commission - Combined Graduate Level', category_name: 'Government Jobs' }
    ],
    subjects: [
        { name: 'Physics', description: 'Study of matter and energy', color: '#3B82F6', icon: 'zap' },
        { name: 'Chemistry', description: 'Study of substances and reactions', color: '#10B981', icon: 'flask' },
        { name: 'Mathematics', description: 'Study of numbers and shapes', color: '#F59E0B', icon: 'calculator' },
        { name: 'Biology', description: 'Study of living organisms', color: '#EC4899', icon: 'activity' },
        { name: 'General Knowledge', description: 'Current affairs and history', color: '#8B5CF6', icon: 'globe' },
        { name: 'English', description: 'English language and aptitude', color: '#6366F1', icon: 'type' }
    ]
};
