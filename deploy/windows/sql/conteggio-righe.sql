-- Numero di righe per tabella del database corrente (per confrontare origine e destinazione).
SET NOCOUNT ON;
SELECT s.name + N'.' + t.name AS Tabella, SUM(p.rows) AS Righe
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
JOIN sys.partitions AS p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.is_ms_shipped = 0
GROUP BY s.name, t.name
ORDER BY Tabella;
