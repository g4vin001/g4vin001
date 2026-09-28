import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
export const recognitionMeter = sqliteTable('recognition_meter', { id:text('id').primaryKey(), used:integer('used').notNull().default(0) });
export const operations = sqliteTable('operations', {
 id:text('id').primaryKey(), kind:text('kind').notNull(), owner:text('owner').notNull(), ip:text('ip').notNull(), digest:text('digest').notNull(), created:integer('created').notNull(), response:text('response'),
}, t=>[index('idx_operations_kind_created').on(t.kind,t.created),index('idx_operations_owner_kind_created').on(t.owner,t.kind,t.created),index('idx_operations_ip_kind_created').on(t.ip,t.kind,t.created)]);
export const cache = sqliteTable('cache',{ key:text('key').primaryKey(), body:text('body').notNull(), expires:integer('expires').notNull() },t=>[index('idx_cache_expires').on(t.expires)]);
export const saved = sqliteTable('saved',{ id:text('id').primaryKey(), owner:text('owner').notNull(), song:text('song').notNull(), created:integer('created').notNull() },t=>[index('idx_saved_owner_created').on(t.owner,t.created)]);

export const scanJobs = sqliteTable('scan_jobs', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), input:text('input').notNull(), inputHash:text('input_hash').notNull(), created:integer('created').notNull(), expires:integer('expires').notNull(),
}, t=>[index('idx_scan_jobs_owner_created').on(t.owner,t.created),index('idx_scan_jobs_expires').on(t.expires)]);
export const scanSegments = sqliteTable('scan_segments', {
 jobId:text('job_id').notNull().references(()=>scanJobs.id,{onDelete:'cascade'}), ordinal:integer('ordinal').notNull(), startMs:integer('start_ms').notNull(), endMs:integer('end_ms').notNull(),
 state:text('state').notNull().default('pending'), mediaHash:text('media_hash'), claimed:integer('claimed'), result:text('result'),
}, t=>[primaryKey({columns:[t.jobId,t.ordinal]})]);
