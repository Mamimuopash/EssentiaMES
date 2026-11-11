-- Da eseguire nel database dell'applicazione: associa il login @login con permessi
-- di sola lettura/scrittura dati (nessun permesso di modifica dello schema).
SET NOCOUNT ON;
DECLARE @q NVARCHAR(MAX);
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @login)
    SET @q = N'ALTER USER ' + QUOTENAME(@login) + N' WITH LOGIN = ' + QUOTENAME(@login) + N';';
ELSE
    SET @q = N'CREATE USER ' + QUOTENAME(@login) + N' FOR LOGIN ' + QUOTENAME(@login) + N';';
SET @q = @q + N' ALTER ROLE [db_datareader] ADD MEMBER ' + QUOTENAME(@login) + N';'
            + N' ALTER ROLE [db_datawriter] ADD MEMBER ' + QUOTENAME(@login) + N';';
EXEC (@q);
SELECT DB_NAME() AS NomeDatabase, @login AS Utente;
