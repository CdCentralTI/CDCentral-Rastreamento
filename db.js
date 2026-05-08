"use strict";

const { purgeOldLeadsFromSupabase, saveLeadToSupabase } = require("./lib/leads-service");

if (require.main === module) {
  require("./server").startServer();
}

module.exports = {
  purgeOldLeadsFromSupabase,
  saveLeadToSupabase,
};
