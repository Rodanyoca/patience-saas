# Référentiel des prestations — exploitation et maintenance

Livraison du 12 novembre 2026. Cette documentation décrit le catalogue implémenté ; elle ne remplace pas les règles de comptabilité ou le cahier des charges général.

## Accès aux interfaces

- Catalogue administratif : http://localhost:3000/administration/prestations
- Branches et affectations : http://localhost:3000/administration/branches
- Opérations des dossiers : http://localhost:3000/prestations
- Nouvelle opération : ouvrir un dossier puis son onglet Prestations.

L’administration existante contient des liens vers les deux nouvelles pages. La liste des opérations et le catalogue sont deux écrans différents.

Seul un utilisateur actif ayant le rôle SQL admin peut gérer les références ou affectations. Cette permission est vérifiée côté serveur, y compris pour un appel direct. Les administrateurs ont accès aux branches ; les autres utilisateurs utilisent branch_memberships. Les comptes existants ont reçu uniquement l’affectation Travel ; leur identité, rôle et mot de passe ne sont pas modifiés. Les nouveaux comptes reçoivent Travel pour préserver le fonctionnement existant ; leurs affectations peuvent ensuite être retirées ou complétées.

## Créer une prestation

1. Ouvrir le catalogue.
2. Cliquer Nouvelle prestation.
3. Choisir une branche active.
4. Saisir nom, description et ordre éventuel.
5. Vérifier le code proposé ; validation et unicité restent côté serveur.
6. Choisir un modèle de formulaire disponible et l’état actif.
7. Enregistrer puis ouvrir un dossier de la même branche.

Le code est unique dans tout le catalogue, en majuscules, sur 2 à 40 caractères, composé de lettres/chiffres/tirets. Il n’est pas une clé primaire. Les identifiants sont stables : UUID pour les nouvelles références, identifiants fixes pour les références initiales.

La sélection d’un dossier ne montre que les prestations actives de sa branche. Les choix sont chargés par une requête ciblée sur branche/activation et triés par ordre puis nom. Aucun remplacement statique n’est utilisé si SQL échoue.

## Modifier ou désactiver

Nom, description, ordre et activation restent modifiables. Après utilisation, code, branche et modèle sont protégés au serveur et par un trigger SQL. La correspondance historique legacy_type n’est pas éditable. Les modifications sont inscrites dans audit_logs avec leur avant/après pour le catalogue.

Désactiver retire la référence des nouvelles sélections. Les opérations existantes et leur libellé de référentiel restent consultables ; le libellé de la référence peut évoluer. Les lignes commerciales déjà créées sont des instantanés indépendants et ne sont pas réécrites lors du renommage.

Les suppressions de références ne sont pas proposées ; un trigger refuse la suppression du catalogue. Les opérations des dossiers ne sont plus effacées par le bouton historique : utiliser un statut d’annulation.

## Branches

Les deux branches initiales sont TRAVEL / LA PATIENCE TRAVEL et CONSTRUCTION / LA PATIENCE CONSTRUCTION. Construction ne reçoit aucune prestation d’exemple.

L’administrateur peut créer de nouvelles branches, modifier leur nom/description/activation et gérer les affectations. Les codes de branches ne sont pas édités dans l’interface. Les FK interdisent de supprimer une branche utilisée.

Le dossier porte branch_id. Chaque opération porte aussi branch_id, contrôlé par deux FK composites : dossier_id + branch_id vers dossiers ; prestation_type_id + branch_id vers prestation_types. Il ne suffit pas de modifier un champ de formulaire pour passer une opération d’une branche à l’autre.

Le formulaire de création d’un dossier affiche son contexte de branche. S’il n’y a qu’une branche autorisée, elle est utilisée ; s’il y en a plusieurs, le choix est explicite. Il n’existe pas encore de portail complet de sélection d’espace après connexion ni de tableau de bord Construction spécialisé.

## Catalogue et modèles de formulaire

| Modèle | Fonction |
|---|---|
| generic | Désignation, statut, fournisseur, devise, prix totaux, observations |
| visa | Champs visa existants |
| flight | Champs billetterie existants |
| hotel | Champs hôtel existants |
| insurance | Champs assurance existants |

Les quatre modèles Travel sont disponibles dans Travel. Les autres branches utilisent le générique dans ce lot. Ajouter un nouveau nom de prestation avec un modèle existant ne nécessite pas de code. Créer un nouveau modèle spécialisé nécessite du développement.

Les prix sont des montants totaux d’opération. Il n’y a pas de quantité/unité ajoutée artificiellement dans details : le schéma financier actuel repose sur une opération et une ligne initiale de quantité 1. Le modèle de métré BTP et les quantités/unité restent à spécifier séparément.

Les états et champs des modèles sont centralisés dans lib/prestation-behavior.ts et les constantes de modèles historiques. Les options commerciales viennent de PostgreSQL. Les valeurs historiques annule et annulee sont reconnues comme annulations sans réécriture des anciennes données.

## Rapports et documents

La page Prestations fournit filtres branche/prestation/état/recherche, pagination de 25 lignes, nombre d’opérations, ventes, coûts et marge. Les montants utilisent les taux historiques des opérations. Les lignes facturées liées sont calculées depuis doc_lines, sans ventiler les remises globales ni inclure les lignes libres : l’écran l’indique.

Les états annulés sont exclus des ventes/coûts/marges par le prédicat partagé. Une facture émise ne disparaît pas parce qu’une opération est annulée ; sa correction commerciale reste une opération séparée.

Les rapports de marge et exports utilisent le libellé SQL du catalogue. Les nouveaux devis/factures prennent le libellé courant au moment de la création de la ligne. Les lignes existantes, taux historiques et numéros ne sont pas recalculés par cette migration.

Le suivi financier général préexistant conserve ses conventions (base USD et dépenses/caisse historiques non rattachées à une branche). Le filtrage analytique des prestations par branche est disponible sur la page Prestations ; ce lot ne transforme pas toute la comptabilité en sous-comptabilités par branche et ne ventile pas des frais généraux non affectés.

## Drizzle Studio

Installer les dépendances avec le gestionnaire du dépôt. Les scripts npm ci-dessous sont également appelables avec pnpm.

```powershell
npm run db:studio
```

Ouvrir ensuite https://local.drizzle.studio. Ce site est l’interface de Studio ; son connecteur local est lié uniquement à 127.0.0.1:4983. Le port 4983 n’est pas une page de l’application LA PATIENCE.

La commande impose explicitement --host=127.0.0.1. Ne pas remplacer cette valeur par 0.0.0.0 et ne pas publier ce port. Studio est un outil puissant de développement/maintenance ; il n’est pas lié dans le menu des employés et ne remplace pas les permissions applicatives.

Le fichier drizzle.config.ts charge l’environnement local et reconnaît lib/db/schema.ts. Ne pas copier la chaîne de connexion dans ce fichier. Le démarrage, l’initialisation du schéma et des lectures des branches/prestations ont été vérifiés par l’API locale, ainsi que l’écoute loopback par netstat.

Pour arrêter Studio, utiliser Ctrl+C dans son terminal. Le laisser fonctionner uniquement pendant la maintenance.

Documentation officielle consultée : [Drizzle Kit Studio](https://orm.drizzle.team/docs/drizzle-kit-studio) et [configuration Drizzle](https://orm.drizzle.team/docs/drizzle-config-file).

## Migrations versionnées

```powershell
npm run db:migrate
npm run db:check
```

Le runner scripts/db-migrate.mjs utilise les fichiers SQL versionnés de migrations/ et un registre public.app_migrations (nom, empreinte SHA-256, date). Un verrou consultatif empêche deux exécutions simultanées. Une migration appliquée dont le contenu change est refusée.

- 0000_legacy.sql : baseline des 22 tables historiques. Sur une base existante, le runner vérifie les colonnes attendues puis enregistre l’adoption sans recréer les tables.
- legacy-columns.json : inventaire utilisé pour l’adoption de baseline.
- 0001_branch_catalog.sql : ajout des branches, affectations, catalogue, colonnes, index, FK et protections SQL ; initialisation idempotente des références ; correspondances certaines.

Ce runner n’utilise pas le journal standard généré par drizzle-kit migrate. Utiliser npm run db:migrate pour ce dépôt ; ne pas lancer drizzle-kit push contre les données existantes pour « synchroniser » le schéma. Le répertoire drizzle-generated est réservé à des propositions locales et n’est pas appliqué automatiquement.

Le runner vérifie le nom de base patience_local. Pour les tests, une exception exige PATIENCE_DB_TEST=1 et un nom commençant par patience_catalog_test_. Ne pas élargir cette garde sans décision explicite.

Avant toute migration en attente sur patience_local, le runner crée un dump PostgreSQL au format custom puis vérifie sa lisibilité avec pg_restore --list. Si la sauvegarde échoue, aucune migration n’est appliquée. Les migrations sont transactionnelles ; aucune suppression de table/donnée métier n’est incluse.

Le répertoire .local-backups est ignoré par Git. Il contient des données sensibles, notamment des informations d’authentification : limiter ses accès et protéger les copies d’archive. La lecture de l’archive a été vérifiée ; une restauration complète sur une machine de secours n’a pas été exécutée dans ce lot.

## Correspondances historiques

| services.type historique | Code du catalogue | Modèle |
|---|---|---|
| billet | TRV-BIL | flight |
| visa | TRV-VIS | visa |
| hotel | TRV-HOT | hotel |
| assurance | TRV-ASS | insurance |

La migration attribue Travel aux dossiers de l’application historique Travel. Elle rattache seulement les quatre types connus, sans modifier leur ancien type ni leurs états.

Une valeur inconnue conserve son type, ses montants et ses détails ; prestation_type_id reste NULL. Elle est signalée dans .local-backups/catalogue-mapping-NOM_DE_BASE.json et reste affichable en lecture. Aucune conversion automatique en « autre ».

Pour une base comportant des inconnus : examiner le rapport, valider leur branche/type avec le responsable métier, préparer une migration suivante explicite et auditée, tester, sauvegarder puis appliquer. Ne pas modifier 0001 après son application. Ne pas imposer NOT NULL globalement tant que ces cas existent.

La colonne reste nullable pour la compatibilité historique ; toutes les nouvelles opérations exigent une référence au serveur et au niveau SQL (trigger). La colonne type reste présente.

## Retour arrière non destructif

Ne pas supprimer les nouvelles tables/colonnes pour revenir à l’ancienne version. L’ancien code n’est pas compatible en écriture avec les nouveaux rattachements obligatoires.

En cas de problème : mettre les écritures en maintenance, conserver la base actuelle et les journaux, restaurer le dump dans une base distincte, vérifier comptes/données/documents et écarts, réconcilier toute activité postérieure, puis valider une bascule de configuration et de code. Une restauration qui écrase la base courante peut perdre les nouvelles opérations et n’est pas automatisée ici.

## Tests reproductibles

Créer une base dédiée dont le nom commence par patience_catalog_test_, avec un propriétaire autorisé, puis définir PATIENCE_TEST_DATABASE_URL dans .env.local. Aucun mot de passe d’administration n’est codé dans les scripts du dépôt.

```powershell
npm run typecheck
npm run test:catalogue
npm run test:catalogue:build
npm run test:catalogue:serve
# Dans un autre terminal :
npm run test:catalogue:http
npm run build
npm run db:check
```

Attention : test:catalogue réinitialise le schéma public de la base de test explicitement sélectionnée. Le garde-fou refuse patience_local. Ne jamais donner l’URL de production à ce script.

Les tests d’intégration créent uniquement des données synthétiques dans cette base isolée. Le test HTTP crée des identifiants et sessions de recette exclusivement dans cette base. Le serveur de recette utilise un répertoire .next-catalogue-test distinct, écoute 127.0.0.1:3101 et n’interrompt pas le serveur de travail sur 3000.

Next.js refuse deux serveurs next dev simultanés pour le même dépôt ; la recette isolée utilise donc un build et next start. Arrêter ce serveur avec Ctrl+C à la fin. Le contrôle HTTP vérifie session, rendu serveur, refus d’accès, PDF et Excel ; il ne remplace pas une validation visuelle avec interactions réelles des fenêtres de formulaire.
