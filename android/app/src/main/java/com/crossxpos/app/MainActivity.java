package com.crossxpos.app;

import com.getcapacitor.BridgeActivity;
import com.crossxpos.app.plugins.BluetoothScannerPlugin;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BluetoothScannerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
