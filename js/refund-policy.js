/* Refund policy v2 — pure business logic shared by the standalone tool and admin port. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RefundPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var REFUND_POLICY = Object.freeze({
    REPLACEMENT_DAYS: 7,
    BASE_REFUND_RATE: 0.80,
    DECAY_POWER: 0.5,
  });

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function calculateRefundBreakdown(paidPrice, totalDays, usedDays) {
    var P = Number(paidPrice);
    var T = Number(totalDays);
    var rawD = Number(usedDays);

    if (
      !Number.isFinite(P) ||
      !Number.isFinite(T) ||
      !Number.isFinite(rawD) ||
      P < 0 ||
      T <= 0
    ) {
      throw new Error("Invalid refund input");
    }

    var D = Math.max(0, Math.min(rawD, T));
    var remainingDays = T - D;
    var remainingRatio = remainingDays / T;
    var remainingValue = P * remainingRatio;
    var usedValue = P - remainingValue;
    var refund = 0;
    var policyKey = "expired";
    var baseRefundRate = 0;
    var decayRatio = 0;
    var decayFactor = 0;

    if (D < T) {
      if (D <= REFUND_POLICY.REPLACEMENT_DAYS || T <= REFUND_POLICY.REPLACEMENT_DAYS) {
        refund = remainingValue;
        policyKey = "replacement-window";
        baseRefundRate = 1;
        decayRatio = 1;
        decayFactor = 1;
      } else {
        decayRatio = remainingDays / (T - REFUND_POLICY.REPLACEMENT_DAYS);
        decayFactor = Math.pow(decayRatio, REFUND_POLICY.DECAY_POWER);
        baseRefundRate = REFUND_POLICY.BASE_REFUND_RATE;
        refund = remainingValue * baseRefundRate * decayFactor;
        policyKey = "depreciated";
      }
    }

    var finalRefund = Math.max(0, Math.min(P, roundMoney(refund)));
    var effectiveRefundPercent = P > 0 ? (finalRefund / P) * 100 : 0;

    return {
      paidPrice: P,
      totalDays: T,
      usedDays: D,
      remainingDays: remainingDays,
      remainingRatio: remainingRatio,
      usedValue: usedValue,
      remainingValue: remainingValue,
      baseRefundRate: baseRefundRate,
      decayRatio: decayRatio,
      decayFactor: decayFactor,
      policyKey: policyKey,
      refund: finalRefund,
      effectiveRefundPercent: effectiveRefundPercent,
    };
  }

  function calculateRefund(paidPrice, totalDays, usedDays) {
    return calculateRefundBreakdown(paidPrice, totalDays, usedDays).refund;
  }

  return {
    REFUND_POLICY: REFUND_POLICY,
    calculateRefund: calculateRefund,
    calculateRefundBreakdown: calculateRefundBreakdown,
  };
});
