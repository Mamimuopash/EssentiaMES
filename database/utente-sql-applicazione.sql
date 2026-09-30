/* ============================================================================
   Login SQL dedicato all'applicazione (permessi minimi)
   ----------------------------------------------------------------------------
   Da eseguire in SSMS con un account amministratore, sostituendo la password.
   L'app legge/scrive i dati ma NON puo' modificare lo schema: lo schema si
   aggiorna eseguendo database/schema.sql da SSMS con un account amministratore.
   ============================================================================ */
USE [master];
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'essentia_app')
    CREATE LOGIN [essentia_app] WITH PASSWORD = N'<<PASSWORD-ROBUSTA-DA-CAMBIARE>>', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
GO
USE [Brighetti];   -- nome del database EssentiaMES
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'essentia_app')
    CREATE USER [essentia_app] FOR LOGIN [essentia_app];
GO
ALTER ROLE db_datareader ADD MEMBER [essentia_app];
ALTER ROLE db_datawriter ADD MEMBER [essentia_app];
GO
