-- Da eseguire su master dopo il ripristino del database @db: proprietario = sa
-- (il proprietario originale potrebbe non esistere su questo server) e livello di
-- compatibilita' almeno 110 (richiesto da EssentiaMES).
SET NOCOUNT ON;
DECLARE @q NVARCHAR(MAX) = N'ALTER AUTHORIZATION ON DATABASE::' + QUOTENAME(@db) + N' TO ' + QUOTENAME(SUSER_SNAME(0x01)) + N';';
EXEC (@q);
IF (SELECT compatibility_level FROM sys.databases WHERE name = @db) < 110
BEGIN
    SET @q = N'ALTER DATABASE ' + QUOTENAME(@db) + N' SET COMPATIBILITY_LEVEL = 110;';
    EXEC (@q);
END
IF (SELECT user_access FROM sys.databases WHERE name = @db) <> 0
BEGIN
    SET @q = N'ALTER DATABASE ' + QUOTENAME(@db) + N' SET MULTI_USER;';
    EXEC (@q);
END
SELECT name AS NomeDatabase, compatibility_level AS Compatibilita, SUSER_SNAME(owner_sid) AS Proprietario, user_access_desc AS Accesso
FROM sys.databases WHERE name = @db;
