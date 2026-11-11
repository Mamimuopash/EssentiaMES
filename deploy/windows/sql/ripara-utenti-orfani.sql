-- Da eseguire nel database appena ripristinato: ricollega gli utenti SQL ai login
-- omonimi di questo server (i SID cambiano tra un server e l'altro) ed elenca gli
-- utenti rimasti senza login (di solito account del vecchio server, non necessari).
SET NOCOUNT ON;
DECLARE @nome SYSNAME, @q NVARCHAR(MAX);
DECLARE utenti CURSOR LOCAL FAST_FORWARD FOR
    SELECT dp.name
    FROM sys.database_principals AS dp
    JOIN sys.server_principals AS sp ON sp.name = dp.name AND sp.type = 'S'
    WHERE dp.type = 'S' AND dp.principal_id > 4 AND dp.authentication_type = 1 AND dp.sid <> sp.sid;
OPEN utenti;
FETCH NEXT FROM utenti INTO @nome;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @q = N'ALTER USER ' + QUOTENAME(@nome) + N' WITH LOGIN = ' + QUOTENAME(@nome) + N';';
    EXEC (@q);
    PRINT N'Utente ' + @nome + N' ricollegato al login omonimo.';
    FETCH NEXT FROM utenti INTO @nome;
END
CLOSE utenti;
DEALLOCATE utenti;

SELECT dp.name AS Utente
FROM sys.database_principals AS dp
LEFT JOIN sys.server_principals AS sp ON sp.sid = dp.sid
WHERE dp.type = 'S' AND dp.principal_id > 4 AND dp.authentication_type = 1 AND sp.sid IS NULL;
