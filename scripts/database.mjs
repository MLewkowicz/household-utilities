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
  const rotation = await db.query("SELECT to_regprocedure('ledger_private.allocate_ledger(jsonb)') AS fn");
  if (!rotation.rows[0].fn) {
    await db.exec(await readFile(new URL('../supabase/migrations/002_rotating_rounding.sql', import.meta.url),'utf8'));
  }
  const misc = await db.query("SELECT to_regprocedure('public.utilities_misc_dashboard()') AS fn");
  if (!misc.rows[0].fn) {
    await db.exec(await readFile(new URL('../supabase/migrations/003_miscellaneous.sql', import.meta.url),'utf8'));
  }
  const icons = await db.query("SELECT to_regprocedure('ledger_private.valid_misc_icon_id(text)') AS fn");
  if (!icons.rows[0].fn) {
    await db.exec(await readFile(new URL('../supabase/migrations/004_expand_icon_catalog.sql', import.meta.url),'utf8'));
  }
  const chores = await db.query("SELECT to_regprocedure('public.utilities_chores_dashboard()') AS fn");
  if (!chores.rows[0].fn) {
    await db.exec(await readFile(new URL('../supabase/migrations/005_chores.sql', import.meta.url),'utf8'));
  }
  const reminders = await db.query("SELECT to_regprocedure('ledger_private.chore_credit_units(jsonb)') AS fn");
  if (!reminders.rows[0].fn) {
    await db.exec(await readFile(new URL('../supabase/migrations/006_chore_reminders.sql', import.meta.url),'utf8'));
  }
  const bulletin = await db.query("SELECT to_regprocedure('public.utilities_bulletin_dashboard()') AS fn");
  if (!bulletin.rows[0].fn) {
    await db.exec(await readFile(new URL('../supabase/migrations/007_bulletin.sql', import.meta.url),'utf8'));
  }
  const push = await db.query("SELECT to_regprocedure('public.utilities_push_config()') AS fn");
  if (!push.rows[0].fn) await db.exec(await readFile(new URL('../supabase/migrations/008_notifications.sql', import.meta.url),'utf8'));
  const taskRefresh = await db.query("SELECT to_regprocedure('public.utilities_save_reminders(jsonb)') AS fn");
  if (!taskRefresh.rows[0].fn) await db.exec(await readFile(new URL('../supabase/migrations/009_task_refresh.sql', import.meta.url),'utf8'));
  const routineDates = await db.query("SELECT to_regprocedure('ledger_private.chore_routine_start(text)') AS fn");
  if (!routineDates.rows[0].fn) await db.exec(await readFile(new URL('../supabase/migrations/010_routine_start_dates.sql', import.meta.url),'utf8'));
  const halfPoints = await db.query("SELECT to_regprocedure('ledger_private.chore_effort(jsonb)') AS fn");
  if (!halfPoints.rows[0].fn) await db.exec(await readFile(new URL('../supabase/migrations/011_half_point_chores.sql', import.meta.url),'utf8'));
  const trashSplit = await db.query("SELECT to_regclass('ledger_private.chore_routine_splits') AS marker");
  if (!trashSplit.rows[0].marker) await db.exec(await readFile(new URL('../supabase/migrations/012_split_trash_routine.sql', import.meta.url),'utf8'));
  for(const [file,fn] of [['013_events.sql','utilities_events_dashboard'],['014_note_reactions.sql','utilities_bulletin_dashboard_before_reactions'],['015_point_presets.sql','utilities_point_policy_preview']]){
    const installed=await db.query(`SELECT to_regprocedure('public.${fn}()') AS fn`);
    if(!installed.rows[0].fn)await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  }
  const queueTiming=await db.query("SELECT to_regprocedure('ledger_private.chore_queue_ready(jsonb,date)') AS fn");
  if(!queueTiming.rows[0].fn)await db.exec(await readFile(new URL('../supabase/migrations/016_chore_queue_timing.sql',import.meta.url),'utf8'));
  for(const [file,signature] of [['017_home_personal_tasks.sql','public.utilities_personal_tasks(jsonb)'],['018_event_icons.sql','ledger_private.valid_event_icon_id(text)'],['019_reaction_library.sql','ledger_private.valid_note_expression(text)'],['020_personal_task_groups.sql','ledger_private.personal_task_group(jsonb)'],['021_personal_group_rename.sql','public.utilities_rename_personal_group(jsonb)']]){
    const installed=await db.query('SELECT to_regprocedure($1) AS fn',[signature]);
    if(!installed.rows[0].fn)await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  }
  return db;
}
export async function callRpc(db,name,params={},role='anon') {
  if (!['personal_tasks','home_order','save_personal_task','rename_personal_group','save_home_order','export_personal_tasks','dashboard','save_payment','import_bills','export_ledger','misc_dashboard','save_misc_expense','save_misc_settlement','export_misc_ledger','chores_dashboard','chores_summary','save_reminders','save_chore','save_chore_routine','export_chores','bulletin_dashboard','save_bulletin_note','export_bulletin','point_policy_preview','apply_point_policy','reverse_point_adjustment','save_note_reaction','events_dashboard','export_events','save_event','save_event_response','push_config','push_device','push_claim','push_finish'].includes(name)) throw new Error('Unknown operation');
  return db.transaction(async tx=>{
    await tx.exec(`SET LOCAL ROLE ${role==='service_role'?'service_role':'anon'}`);
    const result = ['personal_tasks','home_order','save_personal_task','rename_personal_group','save_home_order','export_personal_tasks','save_reminders','save_payment','import_bills','save_misc_expense','save_misc_settlement','save_chore','save_chore_routine','save_bulletin_note','save_event','save_event_response','save_note_reaction','apply_point_policy','reverse_point_adjustment','push_device','push_finish'].includes(name)
      ? await tx.query(`SELECT public.utilities_${name}($1::jsonb) AS result`,[JSON.stringify(params.p)])
      : await tx.query(`SELECT public.utilities_${name}() AS result`);
    return result.rows[0].result;
  });
}
