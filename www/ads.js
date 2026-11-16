// =====================================================================
//  Ads - the one place the game talks to an ad network.
//
//  There is NO ad SDK yet, so no ad is ever ready: isRewardedReady() is
//  false and showRewardedAd() answers false. In the browser it stays
//  that way: the game over screen shows its continue button switched
//  off ("AD NOT AVAILABLE") and everything else works as usual.
//
//  The game uses these two functions only for "Watch ad to continue" on
//  the game over screen (gameover.js). While it waits for the answer the
//  game is paused, its buttons are off and all sound is muted
//  (Sound.setAdPlaying in audio.js); the sound comes back when the
//  answer arrives, and the game gives up after AD_WAIT_LIMIT seconds
//  (config.js).
//
//  TODO (AdMob - nothing is installed yet):
//    - Plugin: @capacitor-community/admob v8 (the one for Capacitor 8).
//      Use it only in this file, and only inside the app
//      (window.Capacitor && Capacitor.isNativePlatform()); in the
//      browser keep answering false as now.
//    - Consent first: ask Google's UMP (User Messaging Platform) through
//      the plugin (requestConsentInfo, then showConsentForm when a form
//      is required) BEFORE AdMob.initialize() and before loading any
//      ad. No consent answer yet = no ads.
//    - Until release use Google's TEST ad IDs only:
//        test app ID (AndroidManifest.xml)  ca-app-pub-3940256099942544~3347511713
//        test rewarded ad unit (Android)    ca-app-pub-3940256099942544/5224354917
//      Put the real IDs in only for the release build.
//    - Loading: prepare a rewarded ad at start-up and again after each
//      one shown (prepareRewardVideoAd), and keep a "ready" flag from
//      the plugin's loaded / failed-to-load events for isRewardedReady().
//    - Showing: showRewardVideoAd(); answer true only if the plugin's
//      "rewarded" event came before the ad was dismissed. Dismissed
//      without it, failed to show, or any error = false.
//      (Check the plugin's README for the exact names in v8.)
//    - Audio: the game already mutes and pauses itself around
//      showRewardedAd(), so nothing more is needed here.
// =====================================================================

// Is a rewarded ad loaded and ready to show right now? Called every
// frame while the game over screen shows, so it must only read a flag.
function isRewardedReady() {
  return false;
}

// Show a rewarded ad. Returns a Promise<boolean>:
//   true   ONLY when the player earned the reward (watched to the end)
//   false  everything else: closed early, no ad, not ready, any error
// It never rejects.
function showRewardedAd() {
  return Promise.resolve(false);
}
