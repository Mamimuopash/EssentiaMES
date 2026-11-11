-- Verifica eseguita con il login dell'applicazione: identita', database e accesso ai dati.
SET NOCOUNT ON;
IF OBJECT_ID(N'dbo.AspNetUsers', N'U') IS NOT NULL
    EXEC (N'SELECT SUSER_SNAME() AS Login, DB_NAME() AS NomeDatabase, (SELECT COUNT(*) FROM dbo.AspNetUsers) AS Utenti;');
ELSE
    SELECT SUSER_SNAME() AS Login, DB_NAME() AS NomeDatabase, CAST(NULL AS INT) AS Utenti;
