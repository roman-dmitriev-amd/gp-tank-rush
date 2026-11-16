// =====================================================================
//  Ads - the one place the game talks to an ad network.
//
//  For now there is NO ad SDK: showRewardedAd() gives the reward at once.
//  Later, plug AdMob (through its Capacitor plugin) in here, without
//  touching the game code.
//
//  The game calls showRewardedAd() only when the player presses
//  "Continue" on the game over screen (requestContinueAd in game.js).
//  While it waits for the answer the game is paused, its buttons are off
//  and all sound is muted, and it gives up after AD_WAIT_LIMIT seconds
//  (config.js).
// =====================================================================

// Show a rewarded ad. Returns a Promise that
//   resolves true   the player earned the reward (the level continues)
//   resolves false  the player closed the ad early ("NO CONTINUE THIS TIME")
//   rejects         no ad could be shown ("NOT AVAILABLE NOW")
function showRewardedAd() {
  return Promise.resolve(true);
}
