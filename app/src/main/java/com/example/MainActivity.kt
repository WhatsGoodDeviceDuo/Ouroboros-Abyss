package com.example

import android.annotation.SuppressLint
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import java.util.Locale

class MainActivity : ComponentActivity(), TextToSpeech.OnInitListener {
    private var webView: WebView? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
            tts?.setPitch(0.82f)
            tts?.setSpeechRate(1.02f)
            ttsReady = true
        }
    }

    inner class TtsBridge {
        @JavascriptInterface
        fun speak(text: String, pitch: Float, rate: Float) {
            if (ttsReady) {
                tts?.setPitch(pitch.coerceIn(0.5f, 1.6f))
                tts?.setSpeechRate(rate.coerceIn(0.7f, 1.5f))
                tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ouroboros_vo")
            }
        }

        @JavascriptInterface
        fun stop() {
            if (ttsReady) {
                tts?.stop()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createConfiguredWebView(): WebView {
        return WebView(this).apply {
            WebView.setWebContentsDebuggingEnabled(true)
            setBackgroundColor(android.graphics.Color.parseColor("#0d131a"))
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )

            @Suppress("DEPRECATION")
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = true
                allowContentAccess = true
                allowFileAccessFromFileURLs = true
                allowUniversalAccessFromFileURLs = true
                loadWithOverviewMode = false
                useWideViewPort = false
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                cacheMode = WebSettings.LOAD_NO_CACHE
            }
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            isFocusable = true
            isFocusableInTouchMode = true

            addJavascriptInterface(TtsBridge(), "AndroidTTS")

            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                    Log.d(
                        "WebViewConsole",
                        "${consoleMessage?.messageLevel()}: ${consoleMessage?.message()} [${consoleMessage?.sourceId()}:${consoleMessage?.lineNumber()}]"
                    )
                    return super.onConsoleMessage(consoleMessage)
                }
            }

            webViewClient = object : WebViewClient() {
                override fun onPageStarted(
                    view: WebView?,
                    url: String?,
                    favicon: android.graphics.Bitmap?
                ) {
                    super.onPageStarted(view, url, favicon)
                    view?.onResume()
                    view?.resumeTimers()
                    Log.d("WebViewClient", "Page started: $url")
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    Log.d("WebViewClient", "Page finished: $url")
                    view?.onResume()
                    view?.resumeTimers()
                    view?.evaluateJavascript(
                        "if (typeof window.onAppForegroundResume === 'function') window.onAppForegroundResume();" +
                            "if (typeof window.forceWakeupAndRenderGame === 'function') window.forceWakeupAndRenderGame();",
                        null
                    )
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    Log.e("WebViewClient", "Error: ${error?.description} on ${request?.url}")
                    super.onReceivedError(view, request, error)
                }
            }

            onResume()
            resumeTimers()
            loadUrl("file:///android_asset/index.html")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            tts = TextToSpeech(this, this)
        } catch (e: Exception) {
            Log.w("MainActivity", "TTS init skipped: ${e.message}")
        }

        // Create and initialize the WebView synchronously in onCreate BEFORE onStart/onResume
        // so lifecycle methods always have a valid non-null WebView reference and timers are never stuck paused.
        val initializedWebView = createConfiguredWebView()
        this.webView = initializedWebView

        enableEdgeToEdge()
        setContent {
            Surface(
                modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.systemBars),
                color = Color(0xFF0D131A)
            ) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = {
                        (initializedWebView.parent as? ViewGroup)?.removeView(initializedWebView)
                        initializedWebView.onResume()
                        initializedWebView.resumeTimers()
                        initializedWebView
                    },
                    update = { view ->
                        view.onResume()
                        view.resumeTimers()
                    }
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        webView?.onResume()
        webView?.resumeTimers()
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
        webView?.resumeTimers()
        webView?.evaluateJavascript(
            "if (typeof window.onAppForegroundResume === 'function') window.onAppForegroundResume();" +
                "if (typeof window.forceWakeupAndRenderGame === 'function') window.forceWakeupAndRenderGame();",
            null
        )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            webView?.onResume()
            webView?.resumeTimers()
            webView?.evaluateJavascript(
                "if (typeof window.onAppForegroundResume === 'function') window.onAppForegroundResume();" +
                    "if (typeof window.forceWakeupAndRenderGame === 'function') window.forceWakeupAndRenderGame();",
                null
            )
        }
    }

    override fun onPause() {
        tts?.stop()
        webView?.evaluateJavascript(
            "if (typeof window.onAppBackgroundPause === 'function') window.onAppBackgroundPause();",
            null
        )
        // NOTE: Do NOT call webView?.pauseTimers() here!
        // WebView.pauseTimers() is a global process-wide Chromium setting that halts HTML parsing,
        // layout, setTimeout, and requestAnimationFrame across all WebViews and Activity restarts.
        super.onPause()
    }

    override fun onStop() {
        tts?.stop()
        webView?.evaluateJavascript(
            "if (typeof window.onAppBackgroundPause === 'function') window.onAppBackgroundPause();",
            null
        )
        super.onStop()
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        webView?.let { wv ->
            (wv.parent as? ViewGroup)?.removeView(wv)
            wv.destroy()
        }
        webView = null
        super.onDestroy()
    }
}
