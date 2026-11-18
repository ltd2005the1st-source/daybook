# The web page calls these by name through window.DaybookAndroid.
-keepclassmembers class app.netlify.mydeardaybook.Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
