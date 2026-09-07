USE eles_lms;

INSERT INTO levels (title, description)
SELECT 'Level 2', 'Early Childhood Learning Management System'
WHERE NOT EXISTS (SELECT 1 FROM levels);

SET @level_id = (SELECT id FROM levels ORDER BY id LIMIT 1);

INSERT INTO units (level_id, unit_number, unit_code, title, status)
SELECT @level_id, 1, 'SCD/CCD/001/L2', 'Introduction to the role of early years practitioner', 'Mandatory'
WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=1);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 2, 'SCD/CCD/002/L2', 'Legislations (The Laws), Policies and Procedures in Early Years', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=2);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 3, 'SCD/CCD/003/L2', 'Equality, Diversity and Inclusive Practice', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=3);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 4, 'SCD/CCD/004/L2', 'Safeguarding and Protection of Children in ECCDE Environment', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=4);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 5, 'SCD/CCD/005/L2', 'Language and Communication', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=5);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 6, 'SCD/CCD/006/L2', 'Lesson Planning in Early Years', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=6);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 7, 'SCD/CCD/007/L2', 'Children’s Learning Perspectives: Play', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=7);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 8, 'SCD/CCD/008/L2', 'Support Healthy Lifestyle for Children through the Provision of Food and Nutrition', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=8);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 9, 'SCD/CCD/009/L2', 'Observation, Assessment and Planning in ECCDE', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=9);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 10, 'SCD/CCD/010/L2', 'Teamwork', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=10);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 11, 'SCD/CCD/011/L2', 'Communication', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=11);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 12, 'SCD/CCD/012/L2', 'Record Keeping and Reporting', 'Mandatory' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=12);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 13, 'SCD/CCD/013/L2', 'Professional Development in ECCDE', 'Optional' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=13);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 14, 'SCD/CCD/014/L2', 'Children School Readiness', 'Optional' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=14);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 15, 'SCD/CCD/015/L2', 'Social Skills and Children Behaviour', 'Optional' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=15);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 16, 'SCD/CCD/016/L2', 'Child Physical Care and Development', 'Optional' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=16);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 17, 'SCD/CCD/017/L2', 'Support Healthy Lifestyle for Children through Exercise', 'Optional' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=17);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 18, 'SCD/CCD/018/L2', 'Child Development from Conception to Five Years', 'Optional' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=18);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 19, 'ENT/CCD/019/001', 'Planning for a Childcare Centre', 'Optional' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=19);
INSERT INTO units (level_id, unit_number, unit_code, title, status) SELECT @level_id, 20, 'ENT/CCD/020/002', 'Childcare Centre Development and Management', 'Optional' WHERE NOT EXISTS (SELECT 1 FROM units WHERE level_id=@level_id AND unit_number=20);

INSERT INTO assessments (level_id, type)
SELECT @level_id, 'Direct Observation' WHERE NOT EXISTS (SELECT 1 FROM assessments WHERE level_id=@level_id AND type='Direct Observation');
INSERT INTO assessments (level_id, type)
SELECT @level_id, 'Question and Answer' WHERE NOT EXISTS (SELECT 1 FROM assessments WHERE level_id=@level_id AND type='Question and Answer');
INSERT INTO assessments (level_id, type)
SELECT @level_id, 'Personal Statement' WHERE NOT EXISTS (SELECT 1 FROM assessments WHERE level_id=@level_id AND type='Personal Statement');
INSERT INTO assessments (level_id, type)
SELECT @level_id, 'Work Practice' WHERE NOT EXISTS (SELECT 1 FROM assessments WHERE level_id=@level_id AND type='Work Practice');
