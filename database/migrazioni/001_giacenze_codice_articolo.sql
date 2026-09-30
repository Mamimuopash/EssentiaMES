/* ============================================================================
   Migrazione dati una-tantum (idempotente): giacenze da Id articolo a CODICE.
   ----------------------------------------------------------------------------
   Le giacenze storiche salvavano l'Id numerico dell'articolo nel campo
   Brighetti_Giacenze.CodiceArticolo. L'applicazione le gestisce comunque in
   entrambi i formati, ma convertirle rende coerenti riordino automatico,
   sync Mexal e flusso di produzione.
   Era gia' inclusa nel vecchio AGGIORNAMENTO_DB.sql: se e' stata eseguita,
   rieseguirla non cambia nulla.
   ============================================================================ */
SET NOCOUNT ON;
GO
IF OBJECT_ID('dbo.Brighetti_Giacenze', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.Brighetti_Articoli', 'U') IS NOT NULL
BEGIN
    UPDATE g
       SET g.CodiceArticolo = a.CodiceArticolo
      FROM dbo.Brighetti_Giacenze g
      INNER JOIN dbo.Brighetti_Articoli a
         ON TRY_CONVERT(INT, g.CodiceArticolo) = a.Id
     WHERE TRY_CONVERT(INT, g.CodiceArticolo) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.Brighetti_Articoli a2 WHERE a2.CodiceArticolo = g.CodiceArticolo);
    PRINT CONCAT('Giacenze convertite: ', @@ROWCOUNT);
END
GO
