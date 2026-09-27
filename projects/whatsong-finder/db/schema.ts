import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const operations = sqliteTable('operations', {
 id:text('id').primaryKey(), kind:text('kind').notNull(), owner:text('owner').notNull(), ip:text('ip').notNull(), digest:text('digest').notNull(), created:integer('created').notNull(), response:text('response'),
}, t=>[index('idx_operations_kind_created').on(t.kind,t.created),index('idx_operations_owner_kind_created').on(t.owner,t.kind,t.created),index('idx_operations_ip_kind_created').on(t.ip,t.kind,t.created)]);
export const cache = sqliteTable('cache',{ key:text('key').primaryKey(), body:text('body').notNull(), expires:integer('expires').notNull() },t=>[index('idx_cache_expires').on(t.expires)]);
export const saved = sqliteTable('saved',{ id:text('id').primaryKey(), owner:text('owner').notNull(), song:text('song').notNull(), created:integer('created').notNull() },t=>[index('idx_saved_owner_created').on(t.owner,t.created)]);
