// Connection to the Supabase project that stores the site's content, images and the admin login.
// Fill in both values from Supabase → Project Settings → API (Project URL, and the anon / publishable key).
// The publishable key is meant to be public: the database rules in supabase/setup.sql decide what it can do.
//
// While these are empty, the public site shows the starter content in js/data.js, and the admin
// only works in "preview mode" on your own computer (localhost), saving to that browser.
window.NS_CONFIG = {
  supabaseUrl: "https://tgfonysjshfiqzyilcqj.supabase.co",
  anonKey: "sb_publishable_XrdAqXtTPlo_ilElKeNilQ_zWZ2zlTu",
};
