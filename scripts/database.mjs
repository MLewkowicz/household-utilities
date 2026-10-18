import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export async function openDatabase(path) {
  const db = new PGlite(path);
  await db.waitReady;
  const exists = await db.query("SELECT to_regprocedure('public.utilities_dashboard()') AS fn");
  if (!exists.rows[0].fn) {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
    await db.exec(await readFile(new URL('../supabase/migrations/001_utilities.sql', import.meta.url),'utf8'));
  }
  return db;
}
export async function callRpc(db,name,params={},role='anon') {
  if (!['dashboard','save_payment','import_bills','export_ledger'].includes(name)) throw new Error('Unknown operation');
  return db.transaction(async tx=>{
    await tx.exec(`SET LOCAL ROLE ${role==='service_role'?'service_role':'anon'}`);
    const result = ['save_payment','import_bills'].includes(name)
      ? await tx.query(`SELECT public.utilities_${name}($1::jsonb) AS result`,[JSON.stringify(params.p)])
      : await tx.query(`SELECT public.utilities_${name}() AS result`);
    return result.rows[0].result;
  });
}
