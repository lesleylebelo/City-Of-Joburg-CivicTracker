-- NON-PRODUCTION ONLY. Run manually as the operator after the two setup scripts.
-- No passwords, accounts or reports are seeded here. This approves one test ID;
-- npm.cmd run seed:test must still use the normal administrator registration flow.
INSERT INTO civictrack.authorised_employees (employee_number, full_names, role)
VALUES ('CT-TEST-ADMIN', 'Test Administrator', 'Test administrator');
