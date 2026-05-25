-- ============================================================
-- CivicTrack Database Setup Script
-- Run this script in SSMS to create the civictrack_db database
-- and all required tables, indexes, and constraints.
--
-- Instructions:
--   1. Open SSMS and connect to localhost\SQLEXPRESS
--   2. Open this file: File > Open > File
--   3. Click Execute (F5)
-- ============================================================

-- Create the database
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'civictrack_db')
BEGIN
    CREATE DATABASE civictrack_db;
END
GO

USE civictrack_db;
GO

-- ============================================================
-- TABLE: authorised_employees
-- Stores pre-approved employees who are allowed to register
-- as administrators. Must exist before administrators table.
-- ============================================================
CREATE TABLE dbo.authorised_employees (
    authorised_id   INT           IDENTITY(1,1) NOT NULL,
    employee_number NVARCHAR(20)  NOT NULL,
    full_names      NVARCHAR(100) NOT NULL,
    role            NVARCHAR(100) NOT NULL,
    is_registered   BIT           NULL CONSTRAINT df_authorised_is_registered DEFAULT (0),
    created_at      DATETIME      NULL CONSTRAINT df_authorised_created_at    DEFAULT (GETDATE()),

    CONSTRAINT pk_authorised_employees PRIMARY KEY CLUSTERED (authorised_id ASC),
    CONSTRAINT uq_authorised_employee_number UNIQUE NONCLUSTERED (employee_number ASC)
);
GO

-- ============================================================
-- TABLE: administrators
-- Stores admin accounts linked to authorised_employees.
-- ============================================================
CREATE TABLE dbo.administrators (
    admin_id        INT           IDENTITY(1,1) NOT NULL,
    full_names      NVARCHAR(100) NOT NULL,
    email           NVARCHAR(150) NOT NULL,
    employee_number NVARCHAR(20)  NOT NULL,
    password_hash   NVARCHAR(255) NOT NULL,
    is_active       BIT           NULL CONSTRAINT df_admin_is_active   DEFAULT (1),
    created_at      DATETIME      NULL CONSTRAINT df_admin_created_at  DEFAULT (GETDATE()),
    updated_at      DATETIME      NULL CONSTRAINT df_admin_updated_at  DEFAULT (GETDATE()),

    CONSTRAINT pk_administrators PRIMARY KEY CLUSTERED (admin_id ASC),
    CONSTRAINT uq_admin_employee_number UNIQUE NONCLUSTERED (employee_number ASC),
    CONSTRAINT uq_admin_email           UNIQUE NONCLUSTERED (email ASC),
    CONSTRAINT fk_admin_authorised FOREIGN KEY (employee_number)
        REFERENCES dbo.authorised_employees (employee_number)
);
GO

-- ============================================================
-- TABLE: residents
-- Stores resident (public user) accounts.
-- ============================================================
CREATE TABLE dbo.residents (
    resident_id   INT           IDENTITY(1,1) NOT NULL,
    full_names    NVARCHAR(100) NOT NULL,
    email         NVARCHAR(150) NOT NULL,
    phone_number  NVARCHAR(15)  NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    is_active     BIT           NULL CONSTRAINT df_residents_is_active   DEFAULT (1),
    created_at    DATETIME      NULL CONSTRAINT df_residents_created_at  DEFAULT (GETDATE()),
    updated_at    DATETIME      NULL CONSTRAINT df_residents_updated_at  DEFAULT (GETDATE()),

    CONSTRAINT pk_residents PRIMARY KEY CLUSTERED (resident_id ASC),
    CONSTRAINT uq_residents_email UNIQUE NONCLUSTERED (email ASC)
);
GO

-- ============================================================
-- TABLE: reported_issues
-- Stores civic issues reported by residents.
-- ============================================================
CREATE TABLE dbo.reported_issues (
    issue_id          INT            IDENTITY(1,1) NOT NULL,
    resident_id       INT            NOT NULL,
    title             NVARCHAR(150)  NOT NULL,
    description       NVARCHAR(MAX)  NOT NULL,
    category          NVARCHAR(50)   NOT NULL,
    status            NVARCHAR(20)   NULL CONSTRAINT df_issues_status   DEFAULT ('Pending'),
    priority          NVARCHAR(10)   NULL CONSTRAINT df_issues_priority DEFAULT ('Medium'),
    location_address  NVARCHAR(255)  NOT NULL,
    latitude          DECIMAL(10, 8) NULL,
    longitude         DECIMAL(11, 8) NULL,
    image_url         NVARCHAR(500)  NULL,
    assigned_admin_id INT            NULL,
    admin_notes       NVARCHAR(MAX)  NULL,
    resolved_at       DATETIME       NULL,
    created_at        DATETIME       NULL CONSTRAINT df_issues_created_at DEFAULT (GETDATE()),
    updated_at        DATETIME       NULL CONSTRAINT df_issues_updated_at DEFAULT (GETDATE()),

    CONSTRAINT pk_reported_issues PRIMARY KEY CLUSTERED (issue_id ASC),

    CONSTRAINT fk_issues_resident FOREIGN KEY (resident_id)
        REFERENCES dbo.residents (resident_id) ON DELETE CASCADE,

    CONSTRAINT fk_issues_admin FOREIGN KEY (assigned_admin_id)
        REFERENCES dbo.administrators (admin_id) ON DELETE SET NULL,

    CONSTRAINT chk_issues_status CHECK (
        status IN ('Pending', 'In Progress', 'Resolved', 'Rejected')
    ),
    CONSTRAINT chk_issues_priority CHECK (
        priority IN ('Low', 'Medium', 'High')
    ),
    CONSTRAINT chk_issues_category CHECK (
        category IN ('Pothole', 'Broken Streetlight', 'Water Leak', 'Sewage',
                     'Illegal Dumping', 'Vandalism', 'Other')
    )
);
GO

-- Indexes for reported_issues
CREATE NONCLUSTERED INDEX idx_issues_status   ON dbo.reported_issues (status ASC);
CREATE NONCLUSTERED INDEX idx_issues_category ON dbo.reported_issues (category ASC);
CREATE NONCLUSTERED INDEX idx_issues_resident ON dbo.reported_issues (resident_id ASC);
GO

-- ============================================================
-- TABLE: development_projects
-- Stores infrastructure/development projects created by admins.
-- ============================================================
CREATE TABLE dbo.development_projects (
    project_id        INT            IDENTITY(1,1) NOT NULL,
    title             NVARCHAR(200)  NOT NULL,
    description       NVARCHAR(MAX)  NOT NULL,
    category          NVARCHAR(50)   NOT NULL,
    status            NVARCHAR(20)   NULL CONSTRAINT df_projects_status     DEFAULT ('Planned'),
    location_address  NVARCHAR(255)  NOT NULL,
    latitude          DECIMAL(10, 8) NULL,
    longitude         DECIMAL(11, 8) NULL,
    start_date        DATE           NULL,
    expected_end_date DATE           NULL,
    actual_end_date   DATE           NULL,
    image_url         NVARCHAR(500)  NULL,
    created_by_admin  INT            NOT NULL,
    created_at        DATETIME       NULL CONSTRAINT df_projects_created_at DEFAULT (GETDATE()),
    updated_at        DATETIME       NULL CONSTRAINT df_projects_updated_at DEFAULT (GETDATE()),

    CONSTRAINT pk_development_projects PRIMARY KEY CLUSTERED (project_id ASC),

    CONSTRAINT fk_projects_admin FOREIGN KEY (created_by_admin)
        REFERENCES dbo.administrators (admin_id),

    CONSTRAINT chk_projects_status CHECK (
        status IN ('Planned', 'In Progress', 'On Hold', 'Completed')
    ),
    CONSTRAINT chk_projects_category CHECK (
        category IN ('Road Construction', 'Building Construction', 'Water Infrastructure',
                     'Electrical Infrastructure', 'Parks & Recreation', 'Other')
    )
);
GO

CREATE NONCLUSTERED INDEX idx_projects_status ON dbo.development_projects (status ASC);
GO

-- ============================================================
-- TABLE: events
-- Stores community events created by admins.
-- ============================================================
CREATE TABLE dbo.events (
    event_id         INT            IDENTITY(1,1) NOT NULL,
    title            NVARCHAR(200)  NOT NULL,
    description      NVARCHAR(MAX)  NOT NULL,
    category         NVARCHAR(50)   NULL CONSTRAINT df_events_category     DEFAULT ('Community Meeting'),
    location_address NVARCHAR(255)  NOT NULL,
    latitude         DECIMAL(10, 8) NULL,
    longitude        DECIMAL(11, 8) NULL,
    event_date       DATE           NOT NULL,
    start_time       TIME(7)        NOT NULL,
    end_time         TIME(7)        NULL,
    image_url        NVARCHAR(500)  NULL,
    is_published     BIT            NULL CONSTRAINT df_events_is_published  DEFAULT (0),
    created_by_admin INT            NOT NULL,
    created_at       DATETIME       NULL CONSTRAINT df_events_created_at    DEFAULT (GETDATE()),
    updated_at       DATETIME       NULL CONSTRAINT df_events_updated_at    DEFAULT (GETDATE()),

    CONSTRAINT pk_events PRIMARY KEY CLUSTERED (event_id ASC),

    CONSTRAINT fk_events_admin FOREIGN KEY (created_by_admin)
        REFERENCES dbo.administrators (admin_id),

    CONSTRAINT chk_events_category CHECK (
        category IN ('Community Meeting', 'Public Hearing', 'Maintenance',
                     'Festival', 'Health', 'Other')
    )
);
GO

CREATE NONCLUSTERED INDEX idx_events_date ON dbo.events (event_date ASC);
GO

-- ============================================================
-- TABLE: notices
-- Stores public notices/announcements created by admins.
-- ============================================================
CREATE TABLE dbo.notices (
    notice_id        INT           IDENTITY(1,1) NOT NULL,
    title            NVARCHAR(200) NOT NULL,
    content          NVARCHAR(MAX) NOT NULL,
    category         NVARCHAR(20)  NULL CONSTRAINT df_notices_category      DEFAULT ('General'),
    is_published     BIT           NULL CONSTRAINT df_notices_is_published   DEFAULT (0),
    published_at     DATETIME      NULL,
    expires_at       DATETIME      NULL,
    created_by_admin INT           NOT NULL,
    created_at       DATETIME      NULL CONSTRAINT df_notices_created_at     DEFAULT (GETDATE()),
    updated_at       DATETIME      NULL CONSTRAINT df_notices_updated_at     DEFAULT (GETDATE()),

    CONSTRAINT pk_notices PRIMARY KEY CLUSTERED (notice_id ASC),

    CONSTRAINT fk_notices_admin FOREIGN KEY (created_by_admin)
        REFERENCES dbo.administrators (admin_id),

    CONSTRAINT chk_notices_category CHECK (
        category IN ('General', 'Water', 'Electricity', 'Roads',
                     'Safety', 'Health', 'Other')
    )
);
GO

CREATE NONCLUSTERED INDEX idx_notices_published ON dbo.notices (is_published ASC);
GO

-- ============================================================
-- TABLE: notifications
-- Stores in-app notifications sent to residents.
-- ============================================================
CREATE TABLE dbo.notifications (
    notification_id INT           IDENTITY(1,1) NOT NULL,
    resident_id     INT           NOT NULL,
    type            NVARCHAR(30)  NOT NULL,
    title           NVARCHAR(200) NOT NULL,
    message         NVARCHAR(MAX) NOT NULL,
    is_read         BIT           NULL CONSTRAINT df_notifications_is_read   DEFAULT (0),
    reference_id    INT           NULL,
    reference_type  NVARCHAR(50)  NULL,
    created_at      DATETIME      NULL CONSTRAINT df_notifications_created_at DEFAULT (GETDATE()),

    CONSTRAINT pk_notifications PRIMARY KEY CLUSTERED (notification_id ASC),

    CONSTRAINT fk_notifications_resident FOREIGN KEY (resident_id)
        REFERENCES dbo.residents (resident_id) ON DELETE CASCADE,

    CONSTRAINT chk_notifications_type CHECK (
        type IN ('Issue Update', 'New Notice', 'New Event',
                 'New Poll', 'Project Update', 'General')
    )
);
GO

CREATE NONCLUSTERED INDEX idx_notifications_res ON dbo.notifications (resident_id ASC, is_read ASC);
GO

-- ============================================================
-- TABLE: password_reset_tokens
-- Stores OTP tokens used for password reset.
-- ============================================================
CREATE TABLE dbo.password_reset_tokens (
    token_id   INT          IDENTITY(1,1) NOT NULL,
    user_type  NVARCHAR(10) NOT NULL,
    user_id    INT          NOT NULL,
    otp_code   NVARCHAR(6)  NOT NULL,
    is_used    BIT          NULL CONSTRAINT df_tokens_is_used   DEFAULT (0),
    expires_at DATETIME     NOT NULL,
    created_at DATETIME     NULL CONSTRAINT df_tokens_created_at DEFAULT (GETDATE()),

    CONSTRAINT pk_password_reset_tokens PRIMARY KEY CLUSTERED (token_id ASC),

    CONSTRAINT chk_tokens_user_type CHECK (
        user_type IN ('resident', 'admin')
    )
);
GO

CREATE NONCLUSTERED INDEX idx_reset_tokens ON dbo.password_reset_tokens (user_id ASC, user_type ASC, is_used ASC);
GO

-- ============================================================
-- TABLE: polls
-- Stores community polls created by admins.
-- ============================================================
CREATE TABLE dbo.polls (
    poll_id          INT           IDENTITY(1,1) NOT NULL,
    question         NVARCHAR(300) NOT NULL,
    description      NVARCHAR(MAX) NULL,
    is_active        BIT           NULL CONSTRAINT df_polls_is_active   DEFAULT (1),
    start_date       DATETIME      NULL CONSTRAINT df_polls_start_date  DEFAULT (GETDATE()),
    end_date         DATETIME      NULL,
    created_by_admin INT           NOT NULL,
    created_at       DATETIME      NULL CONSTRAINT df_polls_created_at  DEFAULT (GETDATE()),
    updated_at       DATETIME      NULL CONSTRAINT df_polls_updated_at  DEFAULT (GETDATE()),

    CONSTRAINT pk_polls PRIMARY KEY CLUSTERED (poll_id ASC),

    CONSTRAINT fk_polls_admin FOREIGN KEY (created_by_admin)
        REFERENCES dbo.administrators (admin_id)
);
GO

CREATE NONCLUSTERED INDEX idx_polls_active ON dbo.polls (is_active ASC);
GO

-- ============================================================
-- TABLE: poll_options
-- Stores the answer options for each poll.
-- ============================================================
CREATE TABLE dbo.poll_options (
    option_id     INT           IDENTITY(1,1) NOT NULL,
    poll_id       INT           NOT NULL,
    option_text   NVARCHAR(200) NOT NULL,
    display_order INT           NULL CONSTRAINT df_poll_options_display_order DEFAULT (0),

    CONSTRAINT pk_poll_options PRIMARY KEY CLUSTERED (option_id ASC),

    CONSTRAINT fk_options_poll FOREIGN KEY (poll_id)
        REFERENCES dbo.polls (poll_id) ON DELETE CASCADE
);
GO

-- ============================================================
-- TABLE: poll_votes
-- Stores votes cast by residents on polls.
-- One vote per resident per poll (enforced by unique constraint).
-- ============================================================
CREATE TABLE dbo.poll_votes (
    vote_id     INT      IDENTITY(1,1) NOT NULL,
    poll_id     INT      NOT NULL,
    option_id   INT      NOT NULL,
    resident_id INT      NOT NULL,
    voted_at    DATETIME NULL CONSTRAINT df_poll_votes_voted_at DEFAULT (GETDATE()),

    CONSTRAINT pk_poll_votes PRIMARY KEY CLUSTERED (vote_id ASC),

    CONSTRAINT uq_unique_vote UNIQUE NONCLUSTERED (poll_id ASC, resident_id ASC),

    CONSTRAINT fk_votes_poll FOREIGN KEY (poll_id)
        REFERENCES dbo.polls (poll_id),

    CONSTRAINT fk_votes_option FOREIGN KEY (option_id)
        REFERENCES dbo.poll_options (option_id),

    CONSTRAINT fk_votes_resident FOREIGN KEY (resident_id)
        REFERENCES dbo.residents (resident_id)
);
GO

-- ============================================================
-- Done!
-- All tables, indexes, and constraints have been created.
-- ============================================================
PRINT 'civictrack_db setup complete. All tables created successfully.';
GO

