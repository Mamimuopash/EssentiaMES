/* ============================================================================
   EssentiaMES - Giacenze lette direttamente dal database di Mexal
   ----------------------------------------------------------------------------
   Crea nel database di EssentiaMES (Brighetti) la vista che la sincronizzazione
   Mexal legge quando nel pannello Automazioni e' attivo
   "Legge le giacenze direttamente dal database di Mexal".

   Colonne della vista:
     Articolo      codice articolo (deve coincidere con il codice in EssentiaMES)
     Giacenza      quantita' disponibile
     ScortaMinima  facoltativa: aggiorna la scorta minima delle giacenze EssentiaMES
     InArrivo      facoltativa: aggiorna la quantita' in arrivo (ordini a fornitori)
     Magazzino     facoltativa: nome o Id del magazzino EssentiaMES. Senza questa
                   colonna si usa il magazzino indicato nel pannello Automazioni.

   Configurata per Mexal_Frontier.dbo.Articoli:
     CKY_ART = codice, NMP_ESI = esistenza, NMP_SMN = scorta minima,
     NMP_QTAOF = quantita' ordinata a fornitori.

   Eseguire da SSMS con un account amministratore (F5). Si puo' rieseguire.
   La vista sta in Brighetti e non in Mexal_Frontier, cosi' resta anche se
   Mexal_Frontier viene ricreato durante l'aggiornamento giornaliero.
   ============================================================================ */
USE [Brighetti];
GO
IF OBJECT_ID(N'dbo.EssentiaMES_GiacenzeMexal', N'V') IS NOT NULL
    DROP VIEW dbo.EssentiaMES_GiacenzeMexal;
GO
CREATE VIEW dbo.EssentiaMES_GiacenzeMexal
AS
SELECT
    LTRIM(RTRIM(a.CKY_ART))               AS Articolo,
    CAST(a.NMP_ESI AS DECIMAL(18, 4))     AS Giacenza
    -- Per prendere da Mexal anche questi valori togliere i due trattini iniziali:
    -- , CAST(a.NMP_SMN   AS DECIMAL(18, 4)) AS ScortaMinima
    -- , CAST(a.NMP_QTAOF AS DECIMAL(18, 4)) AS InArrivo
FROM [Mexal_Frontier].dbo.Articoli AS a
WHERE a.CKY_ART IS NOT NULL AND LTRIM(RTRIM(a.CKY_ART)) <> N'';
GO

/* Il login dell'app legge da Mexal_Frontier solo le colonne usate dalla vista. */
USE [Mexal_Frontier];
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'essentia_app')
    CREATE USER [essentia_app] FOR LOGIN [essentia_app];
GO
GRANT SELECT ON dbo.Articoli (CKY_ART, NMP_ESI, NMP_SMN, NMP_QTAOF) TO [essentia_app];
GO

/* Controllo: le prime righe come le vedra' EssentiaMES. */
USE [Brighetti];
GO
SELECT TOP 10 * FROM dbo.EssentiaMES_GiacenzeMexal;
GO
