-- Crea (o aggiorna) il login SQL dedicato all'applicazione. Parametri: @login, @password.
-- La password viene inserita come stringa letterale con gli apici raddoppiati.
SET NOCOUNT ON;
DECLARE @pwd NVARCHAR(MAX) = N'N''' + REPLACE(@password, N'''', N'''''') + N'''';
DECLARE @q NVARCHAR(MAX);
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @login)
BEGIN
    SET @q = N'CREATE LOGIN ' + QUOTENAME(@login) + N' WITH PASSWORD = ' + @pwd
           + N', DEFAULT_DATABASE = [master], CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;';
    EXEC (@q);
    SELECT N'creato' AS Esito;
END
ELSE
BEGIN
    SET @q = N'ALTER LOGIN ' + QUOTENAME(@login) + N' WITH CHECK_POLICY = ON, CHECK_EXPIRATION = OFF; '
           + N'ALTER LOGIN ' + QUOTENAME(@login) + N' WITH PASSWORD = ' + @pwd + N' UNLOCK; '
           + N'ALTER LOGIN ' + QUOTENAME(@login) + N' ENABLE;';
    EXEC (@q);
    SELECT N'aggiornato' AS Esito;
END
