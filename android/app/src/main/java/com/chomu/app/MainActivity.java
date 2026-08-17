package com.chomu.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered before super.onCreate() so the bridge picks it up.
        registerPlugin(ChomuGeneratorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
