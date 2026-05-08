"use strict";

const { purgeOldLeadsFromSupabase, saveLeadToSupabase } = require("./lib/leads-service");

require("./server").startServer();

module.exports = {
  purgeOldLeadsFromSupabase,
  saveLeadToSupabase,
};
