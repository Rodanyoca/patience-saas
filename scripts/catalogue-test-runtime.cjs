const {createRequire}=require('node:module')
const root=process.cwd(),req=createRequire(root+'/package.json')
req('@next/env').loadEnvConfig(root,false,{info(){},error(){}})
const url=process.env.PATIENCE_TEST_DATABASE_URL
if(!url||!new URL(url).pathname.startsWith('/patience_catalog_test_'))throw Error('Base de test isolée requise.')
const mode=process.argv[2]==='build'?'build':'start'
process.env.DATABASE_URL=url
process.env.BETTER_AUTH_URL='http://localhost:3101'
process.env.NEXT_DIST_DIR='.next-catalogue-test'
process.env.NODE_ENV='production'
process.argv=[process.execPath,root+'/node_modules/next/dist/bin/next',mode,...(mode==='start'?['--port','3101','--hostname','127.0.0.1']:[])]
require(root+'/node_modules/next/dist/bin/next')
