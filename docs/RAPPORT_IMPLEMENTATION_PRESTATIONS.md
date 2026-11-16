# Rapport d’implémentation — Branches et référentiel des prestations

Date : 12 novembre 2026. Dépôt : patience-saas. Aucun commit ni push réalisé.

## Synthèse

Le catalogue est administrable depuis PostgreSQL, distinct des opérations de dossiers. Les formulaires spécialisés Travel sont conservés ; un modèle générique permet de nouvelles prestations sans changement de code. Les deux branches officielles sont initialisées, Construction reste sans prestation configurée.

Accès :
- /administration/prestations
- /administration/branches
- /prestations
- Drizzle Studio : https://local.drizzle.studio, connecteur local 127.0.0.1:4983.

## A. Analyse initiale

### État vérifié avant modification

PostgreSQL 17.11 accessible ; base patience_local ; rôle patience_app ; environnement chargé ; 22 tables historiques et 229 colonnes présentes. Aucun référentiel équivalent de branches/types, aucune organisation de migrations existante.

Un compte, une session, un compte de connexion, les paramètres d’agence et USD sont présents. Aucun client, dossier, prestation ou document commercial n’est enregistré. Les migrations historiques ont néanmoins été testées sur des données représentatives dans une base séparée.

Le contrôle final vérifie aussi types SQL, nullabilité, présence des défauts déclarés, PK, unicités simples, FK déclarées et index nommés. Il ne prétend pas certifier toutes les règles métier par simple introspection.

### Dépendances trouvées

- lib/constants.ts : liste historique des types, états et champs spécialisés.
- components/service-form.tsx : sélection codée en dur, fournisseurs préférés et champs par type.
- app/actions/dossiers.ts : validation par liste statique, création/modification et rattachement par dossier.
- Onglet prestations du dossier : affichage et édition par type historique.
- Liste prestations : onglets statiques et filtre sur services.type.
- Liste dossiers : filtres et étiquettes par type statique.
- Facturation : génération des descriptions de lignes depuis le type.
- Fournisseurs : libellés, états et calcul des coûts.
- Tableau de bord : répartition des prestations et rendez-vous visa.
- lib/reports.ts, finances et export Excel : regroupements/libellés et exclusion d’annulations.
- PDF : lecture des lignes commerciales déjà enregistrées ; aucune réécriture historique nécessaire.

### Problèmes traités

Catalogue absent ; confusion entre type commercial et modèle de formulaire ; absence de rattachement métier de branche ; validation d’un type client exclusivement par constante ; risque d’accès interbranche ; dépendances de libellés statiques ; absence de migrations, de consultation Studio et de tests.

L’ancien code excluait principalement annule des calculs. Les modèles courants utilisaient cette valeur, mais les variantes historiques annulee doivent également être traitées. La correction reconnaît les deux sans normaliser automatiquement les données existantes.

## B. Base de données

### Tables ajoutées

| Table | Fonction |
|---|---|
| branches | Référentiel stable des branches |
| prestation_types | Catalogue, modèle, état, ordre et correspondance historique |
| branch_memberships | Affectations des utilisateurs aux branches |
| app_migrations | Registre technique des migrations et empreintes |

Résultat : 25 tables applicatives, 252 colonnes applicatives ; 1 table technique supplémentaire de migrations (26 tables publiques au total).

### Colonnes ajoutées

- dossiers.branch_id, obligatoire.
- services.branch_id, obligatoire.
- services.prestation_type_id, nullable pour l’historique ; obligatoire pour les nouvelles opérations par validation et trigger SQL.

La colonne services.type est conservée. Aucun montant, taux, état historique, numéro ni contenu de facture n’a été réécrit par la migration.

### Contraintes et index

Codes de branches uniques ; codes du catalogue uniques globalement ; noms non vides ; modèles de formulaire limités aux valeurs prises en charge ; ordre positif ; FK vers branches et utilisateurs.

Unicités composites dossier(id, branch_id) et type(id, branch_id). Deux FK composites sur services garantissent branche de dossier = branche d’opération = branche du catalogue. Index de sélection branche/activation/ordre/nom et index de consultation des opérations par catalogue/branche/état.

Triggers : protection des codes/branches/modèles déjà utilisés et de legacy_type ; refus de suppression du catalogue ; vérification des références/activations lors des nouvelles opérations ; affectation initiale Travel lors d’une création de compte.

Les contraintes de suppression des branches utilisées reposent sur les FK RESTRICT. L’interface propose l’activation/désactivation, pas une suppression physique.

### Migrations appliquées

1. 0000_legacy.sql : baseline adoptée après contrôle des colonnes, sans recréation des tables existantes.
2. 0001_branch_catalog.sql : ajout du modèle et initialisation des références.

Runner transactionnel versionné, verrou consultatif, empreintes SHA-256, refus de modifier une migration déjà appliquée. Une réapplication a été exécutée : aucun doublon, aucune réécriture.

### Références créées

TRAVEL et CONSTRUCTION. Quatre types Travel : TRV-BIL, TRV-VIS, TRV-HOT, TRV-ASS. Aucune prestation Construction ni opération fictive créée dans patience_local.

### Sauvegarde et conservation

Sauvegarde : .local-backups/before-catalogue-1794516765403.dump. Archive PostgreSQL custom créée avant la migration et relue par pg_restore --list. Ce contrôle ne constitue pas un exercice complet de restauration.

Rapport de correspondances : .local-backups/catalogue-mapping-patience_local.json. Rapport partageable sans secrets : MIGRATION_PRESTATIONS_2026-11-12.json dans ce dossier.

- Prestations historiques présentes : 0.
- Prestations rattachées localement : 0.
- Types inconnus locaux : 0.
- Effectifs des tables historiques : inchangés.
- Instantanés prestations/documents/lignes : inchangés.

La base de recette contient volontairement quatre types historiques, une annulation alternative et un type inconnu. Les types connus sont rattachés, l’inconnu reste non rattaché et n’est pas transformé en « autre ». Les comptes réels et leurs secrets n’ont pas été modifiés.

## C. Interfaces et comportements

### Pages créées

- Administration du catalogue : filtres branche/état/nom/code, tri, total, pagination de 25 lignes.
- Administration des branches et affectations.
- États d’erreur de données, sans liste fictive.

### Pages et composants adaptés

- Administration existante : liens vers catalogue et branches.
- Création dossier : contexte de branche explicite ; sélection obligatoire si plusieurs branches.
- Dossier : accès contrôlé, liste dynamique, conservation des types inactifs et signalement des inconnus.
- Formulaire prestation : catalogue actif de la branche ; choix du modèle depuis la référence ; édition conservant le type de l’opération.
- Prestations enregistrées : liste paginée, branche, prestation, états, recherche et indicateurs.
- Dossiers : filtres et libellés depuis SQL.
- Fournisseurs : noms et états dynamiques.
- Tableau de bord, finances et export : noms du référentiel et annulations reconnues.
- Listes/détails commerciaux et téléchargements concernés : contrôles de branche additionnels.

### Compatibilités préservées

Visa, flight/billetterie, hôtel et assurance gardent leurs champs et états existants. Le générique ajoute des observations sans inventer un moteur de formulaires.

Les documents utilisent la désignation du catalogue à la création de leurs lignes ; les lignes déjà créées sont conservées. La numérotation reste inchangée. Les taux d’opérations existantes sont conservés quand la devise reste la même.

Les prix restent des totaux par opération. Quantités, unités et métrés Construction ne sont pas ajoutés artificiellement au JSON ou aux calculs existants.

## D. Résultats des tests

### Tests d’intégration réellement exécutés

Base : patience_catalog_test_1794514510957, séparée de patience_local. Les données sont synthétiques et confinées à cette base.

| Test | Scénario/attendu | Résultat obtenu | Statut |
|---|---|---|---|
| 01 | Référentiel PostgreSQL | Quatre références Travel ; Construction vide | Réussi |
| 02 | Création et unicité | Insertion, refus de doublon et code invalide | Réussi |
| 03 | Disponibilité dynamique | Nouveau type visible, opération enregistrée | Réussi |
| 04 | Isolation | Refus applicatif et SQL d’un rattachement interbranche | Réussi |
| 05 | Désactivation | Plus de sélection nouvelle ; opération existante conservée et éditable | Réussi |
| 06 | Renommage/protection | Nouveau nom ; facture et ligne fixes ; code et branche utilisés protégés | Réussi |
| 07 | Modèles Travel | Champs spécialisés et quatre créations via modèles existants | Réussi |
| 08 | Générique | Observations enregistrées | Réussi |
| 09 | Historique | Six lignes conservées ; type inconnu non rattaché | Réussi |
| 10 | Rapports | annule/annulee exclus ; ventes 280 et coûts 110 sur le jeu contrôlé | Réussi |
| 11 | Permissions | Agent refusé sur les commandes administratives directes | Réussi |
| 12 | Indisponibilité SQL simulée | Connexion au port de test indisponible rejetée | Réussi |
| 13 | Réapplication | Pas de doublon ; documents historiques identiques | Réussi |
| 14 | Affectations/taux | Attribution/retrait de branche ; taux historique conservé | Réussi |
| 15 | Volume/pagination | 80 références ajoutées en recette ; page SQL de 25 distinctes | Réussi |
| 16 | Contraintes/concurrence | Suppressions et code protégé refusés ; une seule création pour un code concurrent | Réussi |
| 17 | Validation | Date impossible, statut inconnu et montant invalide refusés | Réussi |

Le test 12 n’a pas arrêté le service PostgreSQL réel. L’arrêt d’une instance de test et la vérification visuelle de sa page d’erreur ne sont pas exécutés. Le service local utilisé par l’utilisateur est resté en fonctionnement.

### Vérifications HTTP réellement exécutées

Connexion Better Auth avec comptes de recette et cookies isolés. HTTP et contenu attendu contrôlés pour :
- catalogue, filtre Construction vide et page 2 ;
- branches et affectations ;
- dossiers Travel/Construction et onglets prestations ;
- opérations Travel/Construction ;
- facturation, finances, tableau de bord et fournisseurs ;
- refus d’accès au catalogue pour l’agent ;
- PDF historique et export Excel.

Ces contrôles vérifient la chaîne authentification → serveur → SQL → rendu/document. Ils ne simulent pas les clics/saisies dans les fenêtres de formulaire.

### Vérification visuelle

Non exécutée de bout en bout : le navigateur intégré est indisponible ; la tentative de contrôle de la fenêtre Edge existante a échoué à l’activation. Un ancien écran d’erreur avant migration nécessitait une actualisation ; il n’a pas été accepté comme preuve du rendu final.

Ne pas interpréter les tests HTTP comme une recette visuelle responsive complète.

### Commandes

- npm run typecheck : réussi.
- npm run test:catalogue : 17 réussis, 0 échec.
- Build de production isolé : réussi.
- npm run test:catalogue:http : réussi sur le serveur isolé.
- npm run build final : réussi avec contrôle TypeScript actif.
- npm run db:migrate relancé : idempotent.
- npm run db:check : 0 écart de schéma détecté, 0 incohérence interbranche.
- Studio : initialisation/lecture réussies ; écoute 127.0.0.1 confirmée.
- git diff --check : réussi.
- Aucun script lint n’était disponible ; aucun résultat de lint n’est annoncé.

## E. Limites et décisions restantes

- Recette visuelle des fenêtres et du responsive non terminée.
- Construction reste un catalogue générique ; aucun module de métré/stock/situation BTP n’est prétendu livré.
- Pas de générateur arbitraire de nouveaux formulaires.
- Pas de nouvelle numérotation par branche.
- Le suivi financier général préexistant reste consolidé ; les frais généraux non affectés ne sont pas ventilés automatiquement par branche. L’analyse des prestations dispose de son filtre de branche.
- Les montants de lignes facturées affichés dans Prestations ne ventilent pas les remises globales ni les lignes sans prestation ; cela est indiqué dans l’écran.
- Le rattachement historique demeure nullable pour préserver les valeurs inconnues ; les nouvelles saisies exigent un catalogue.
- Le rollback nécessite une restauration contrôlée vers une base distincte et une décision de bascule ; pas de down destructif.
- Une restauration complète du dump n’a pas été exécutée.
- npm audit --omit=dev a renvoyé 16 alertes (2 faibles, 10 modérées, 4 élevées, 0 critique), dans l’arbre de dépendances. Ce constat ne prouve pas l’exploitabilité de chaque alerte dans l’application. Aucune mise à jour majeure automatique ni audit fix --force n’a été lancé.

## F. État final et fichiers

Le serveur de recette 3101 est arrêté. Drizzle Studio reste disponible sur loopback ; le serveur de travail sur 3000 n’a pas été arrêté par ce lot.

### Nouveaux fichiers principaux

- lib/branches.ts, lib/catalogue.ts, lib/catalogue-commands.ts
- lib/prestation-behavior.ts, lib/prestation-report.ts
- lib/service-commands.ts, lib/service-sql.ts
- lib/commercial-access.ts, lib/commercial-scope.ts
- app/actions/catalogue.ts
- app/(app)/administration/prestations/page.tsx et error.tsx
- app/(app)/administration/branches/page.tsx
- app/(app)/error.tsx, app/error.tsx
- components/catalogue-form.tsx
- drizzle.config.ts
- migrations/0000_legacy.sql, migrations/0001_branch_catalog.sql, migrations/legacy-columns.json
- scripts/db-migrate.mjs, scripts/db-check.mjs
- scripts/catalogue-test-runtime.cjs, scripts/catalogue-http-smoke.mjs
- tests/catalogue/catalogue.test.cjs
- .env.example
- docs/REFERENTIEL_PRESTATIONS.md
- docs/MIGRATION_PRESTATIONS_2026-11-12.json
- ce rapport

### Fichiers existants adaptés pour ce lot

Schéma, constantes de compatibilité, formulaire de prestation, actions dossiers/facturation/fichiers, administration, dossiers et leurs composants, liste des prestations, tableau de bord, fournisseurs, finances, facturation, clients, documents, exports et routes de téléchargement/PDF ; contexte de navigation ; scripts/dépendances/lockfiles/configuration Next/TypeScript et exclusions Git.

Les sources d’authentification et mots de passe réels ne sont pas modifiés. Les données commerciales réelles ne sont pas modifiées.

### Diff global du répertoire de travail

Le répertoire contenait déjà les changements de connexion, de charte et le cahier des charges de la session précédente. Les états Git ci-dessous incluent ces travaux antérieurs : ne pas les attribuer intégralement au catalogue. Les fichiers nouveaux non suivis n’entrent pas dans git diff --stat ; ils sont listés ci-dessus et dans git status.

```text
$ git diff --stat
 .gitignore                                       |  10 +-
 app/(app)/administration/page.tsx                |   2 +
 app/(app)/clients/[id]/page.tsx                  |   7 +-
 app/(app)/documents/page.tsx                     |   3 +-
 app/(app)/dossiers/[id]/_components/overview.tsx |   9 +-
 app/(app)/dossiers/[id]/_components/services.tsx | 164 +----
 app/(app)/dossiers/[id]/page.tsx                 |   4 +
 app/(app)/dossiers/new/page.tsx                  |   4 +
 app/(app)/dossiers/page.tsx                      |  16 +-
 app/(app)/facturation/[id]/page.tsx              |   4 +
 app/(app)/facturation/page.tsx                   |  13 +-
 app/(app)/finances/page.tsx                      |   2 +-
 app/(app)/fournisseurs/[id]/page.tsx             |  16 +-
 app/(app)/page.tsx                               |  30 +-
 app/(app)/prestations/page.tsx                   | 175 +----
 app/actions/billing.ts                           |  21 +-
 app/actions/dossiers.ts                          | 109 +--
 app/actions/files.ts                             |   4 +
 app/api/export/route.ts                          |  10 +-
 app/api/files/[id]/route.ts                      |   2 +
 app/api/pdf/doc/[id]/route.ts                    |   2 +
 app/api/pdf/receipt/[id]/route.ts                |   2 +
 app/globals.css                                  |  90 ++-
 app/layout.tsx                                   |   6 +-
 app/sign-in/page.tsx                             |  69 +-
 components/app-sidebar.tsx                       |  23 +-
 components/auth-form.tsx                         |  67 +-
 components/service-form.tsx                      | 151 +---
 components/shared.tsx                            |   4 +-
 components/ui/button.tsx                         |   2 +-
 components/ui/table.tsx                          |   4 +-
 lib/constants.ts                                 |   1 +
 lib/db/schema.ts                                 |  44 +-
 lib/pdf.tsx                                      |  15 +-
 lib/reports.ts                                   |  28 +-
 next.config.mjs                                  |   3 +-
 package.json                                     |  13 +-
 pnpm-lock.yaml                                   | 861 ++++++++++++++++++++++-
 tsconfig.json                                    |  18 +-
 39 files changed, 1318 insertions(+), 690 deletions(-)

$ git status --short
 M .gitignore
 M app/(app)/administration/page.tsx
 M app/(app)/clients/[id]/page.tsx
 M app/(app)/documents/page.tsx
 M app/(app)/dossiers/[id]/_components/overview.tsx
 M app/(app)/dossiers/[id]/_components/services.tsx
 M app/(app)/dossiers/[id]/page.tsx
 M app/(app)/dossiers/new/page.tsx
 M app/(app)/dossiers/page.tsx
 M app/(app)/facturation/[id]/page.tsx
 M app/(app)/facturation/page.tsx
 M app/(app)/finances/page.tsx
 M app/(app)/fournisseurs/[id]/page.tsx
 M app/(app)/page.tsx
 M app/(app)/prestations/page.tsx
 M app/actions/billing.ts
 M app/actions/dossiers.ts
 M app/actions/files.ts
 M app/api/export/route.ts
 M app/api/files/[id]/route.ts
 M app/api/pdf/doc/[id]/route.ts
 M app/api/pdf/receipt/[id]/route.ts
 M app/globals.css
 M app/layout.tsx
 M app/sign-in/page.tsx
 M components/app-sidebar.tsx
 M components/auth-form.tsx
 M components/service-form.tsx
 M components/shared.tsx
 M components/ui/button.tsx
 M components/ui/table.tsx
 M lib/constants.ts
 M lib/db/schema.ts
 M lib/pdf.tsx
 M lib/reports.ts
 M next.config.mjs
 M package.json
 M pnpm-lock.yaml
 M tsconfig.json
?? .env.example
?? CAHIER_DES_CHARGES_LA_PATIENCE.md
?? app/(app)/administration/branches/
?? app/(app)/administration/prestations/
?? app/(app)/error.tsx
?? app/actions/catalogue.ts
?? app/error.tsx
?? components/catalogue-form.tsx
?? docs/
?? drizzle.config.ts
?? lib/branches.ts
?? lib/brand.ts
?? lib/catalogue-commands.ts
?? lib/catalogue.ts
?? lib/commercial-access.ts
?? lib/commercial-scope.ts
?? lib/prestation-behavior.ts
?? lib/prestation-report.ts
?? lib/service-commands.ts
?? lib/service-sql.ts
?? migrations/
?? next-env.d.ts
?? package-lock.json
?? "public/LP simple P ouvert en bas corrige.png"
?? "public/Logo CONSTRUCTION en jaune.png"
?? "public/TRAVEL avion or detaille 1.png"
?? scripts/
?? tests/
```

