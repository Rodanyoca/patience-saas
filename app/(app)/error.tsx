'use client'
export default function ApplicationDataError({reset}:{reset:()=>void}){
 return <section role="alert" className="rounded-lg border border-destructive/30 bg-card p-6"><h1 className="text-lg font-semibold">Données temporairement indisponibles</h1><p className="mt-2 text-sm text-muted-foreground">Impossible de charger les données. Vérifiez la disponibilité du service et réessayez. Aucune donnée de remplacement n’est affichée.</p><button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground">Réessayer</button></section>
}
