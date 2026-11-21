package com.example

import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLooper
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MainActivityTest {

    @Test
    fun testMainActivityLaunchesAndLoadsAsset() {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        scenario.onActivity { activity ->
            assertNotNull(activity)
            val field = MainActivity::class.java.getDeclaredField("webView")
            field.isAccessible = true
            val wv = field.get(activity) as? WebView
            assertNotNull("WebView should not be null", wv)
            val shadowWebView = shadowOf(wv)
            val lastUrl = shadowWebView.lastLoadedUrl
            println("Last loaded URL: $lastUrl")
            assertEquals("file:///android_asset/index.html", lastUrl)
        }
    }
}
