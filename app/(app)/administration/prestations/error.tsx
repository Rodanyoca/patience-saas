'use client'
export default function CatalogueError({reset}:{reset:()=>void}){
 return <div role="alert" className="rounded-lg border border-destructive/30 bg-card p-6"><h2 className="font-semibold">Référentiel indisponible</h2><p className="mt-2 text-sm">La base de données n’a pas répondu. Aucune liste de remplacement n’est utilisée.</p><button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground">Réessayer</button></div>
}
