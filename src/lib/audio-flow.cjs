'use strict';
function createCreditGate(limit = 8) {
  let credits = limit;
  return {
    take() {
      if (credits <= 0) return false;
      credits--;
      return true;
    },
    release(count = 1) {
      if (Number.isInteger(count) && count > 0) credits = Math.min(limit, credits + count);
    },
  };
}
module.exports = { createCreditGate };
