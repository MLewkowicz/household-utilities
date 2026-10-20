// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
import {createHandler} from './worker.ts';
const env=(key:string)=>Deno.env.get(key)||'';
Deno.serve(createHandler({
 url:env('SUPABASE_URL'),serviceKey:env('SUPABASE_SERVICE_ROLE_KEY'),
 senderSecret:env('HOUSEHOLD_PUSH_SENDER_SECRET'),publicKey:env('HOUSEHOLD_VAPID_PUBLIC_KEY'),
 privateKey:env('HOUSEHOLD_VAPID_PRIVATE_KEY'),subject:env('HOUSEHOLD_VAPID_SUBJECT'),
},(subscription,payload,options)=>webpush.generateRequestDetails(subscription,payload,options)));
