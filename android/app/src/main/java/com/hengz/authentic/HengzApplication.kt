package com.hengz.authentic

import android.app.Application
import com.entrupy.sdk.app.EntrupyApp

/** Initializes the Entrupy SDK once, before any SDK screen is shown (required by the SDK). */
class HengzApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        EntrupyApp.init(this)
    }
}
