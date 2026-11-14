/* =====================================================================
   WARD NO. 65 PORTAL - connection settings
   Fill in the two Supabase values (Supabase -> Project Settings -> API).
   The "anon public" key is MEANT to be public: the database rules
   (Row Level Security in supabase/schema.sql) are what protect the data.
   NEVER put the "service_role" key in this file.
   ===================================================================== */
window.WARD65_CONFIG = {
  SUPABASE_URL: 'PASTE_YOUR_SUPABASE_URL_HERE',        // e.g. https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE',

  // Used only if no banner has been uploaded in Admin -> Settings.
  // Put the supplied banner file at this path (any name/format is fine, just match it here).
  FALLBACK_BANNER: 'assets/img/banner.jpg',

  MAX_PHOTOS: 5,        // photos per complaint (the database allows 6 files in total)
  MAX_VIDEO_MB: 25      // must not exceed the bucket limit set in schema.sql (25 MB)
};
