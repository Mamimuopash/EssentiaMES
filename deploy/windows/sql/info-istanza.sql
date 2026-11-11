-- Informazioni sull'istanza SQL Server e sul database @db (anche se non esiste).
-- Usato da prepara-sql-server.ps1 e porting-database.ps1.
SET NOCOUNT ON;
DECLARE @backup NVARCHAR(4000) = NULL;
BEGIN TRY
    EXEC master.dbo.xp_instance_regread N'HKEY_LOCAL_MACHINE', N'Software\Microsoft\MSSQLServer\MSSQLServer', N'BackupDirectory', @backup OUTPUT;
END TRY
BEGIN CATCH
    SET @backup = NULL;
END CATCH;
IF @backup IS NULL SET @backup = CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS NVARCHAR(4000));

SELECT
    @@SERVERNAME                                                AS NomeServer,
    CAST(SERVERPROPERTY('MachineName') AS NVARCHAR(256))        AS Macchina,
    CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(64))      AS Versione,
    CAST(SERVERPROPERTY('ProductLevel') AS NVARCHAR(64))        AS LivelloProdotto,
    CAST(SERVERPROPERTY('Edition') AS NVARCHAR(256))            AS Edizione,
    CAST(SERVERPROPERTY('EngineEdition') AS INT)                AS TipoMotore,
    CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS INT)     AS SoloWindows,
    CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS NVARCHAR(4000)) AS CartellaDati,
    CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS NVARCHAR(4000))  AS CartellaLog,
    @backup                                                     AS CartellaBackup,
    IS_SRVROLEMEMBER('sysadmin')                                AS Sysadmin,
    d.name                                                      AS NomeDatabase,
    d.compatibility_level                                       AS Compatibilita,
    d.state_desc                                                AS Stato,
    d.user_access_desc                                          AS Accesso,
    d.is_read_only                                              AS SolaLettura,
    (SELECT SUM(CAST(f.size AS BIGINT)) * 8 / 1024 FROM sys.master_files f WHERE f.database_id = d.database_id AND f.type = 0) AS DatiMB,
    (SELECT SUM(CAST(f.size AS BIGINT)) * 8 / 1024 FROM sys.master_files f WHERE f.database_id = d.database_id AND f.type = 1) AS LogMB
FROM (SELECT 1 AS uno) AS x
LEFT JOIN sys.databases AS d ON d.name = @db;
