package com.crossxpos.app.plugins;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "BluetoothScanner",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth"),
        @Permission(strings = { Manifest.permission.BLUETOOTH }, alias = "bluetooth_legacy"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location")
    }
)
public class BluetoothScannerPlugin extends Plugin {

    private static final int REQUEST_ENABLE_BT = 1001;
    private PluginCall pendingScanCall;
    private BroadcastReceiver discoveryReceiver;
    private final List<JSONObject> discoveredDevices = new ArrayList<>();
    private boolean isScanning = false;

    @PluginMethod
    public void scan(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Bluetooth not supported on this device");
            return;
        }

        if (!adapter.isEnabled()) {
            // Ask user to enable Bluetooth
            Intent enableBtIntent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
            pendingScanCall = call;
            startActivityForResult(call, enableBtIntent, "enableBluetooth");
            return;
        }

        startDiscovery(call);
    }

    @PluginMethod
    public void getPairedDevices(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Bluetooth not supported");
            return;
        }

        JSONArray pairedArray = new JSONArray();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
                call.reject("Bluetooth permission not granted");
                return;
            }
        }

        for (BluetoothDevice device : adapter.getBondedDevices()) {
            JSONObject obj = new JSONObject();
            try {
                obj.put("name", device.getName() != null ? device.getName() : "Unknown");
                obj.put("address", device.getAddress());
                obj.put("paired", true);
                pairedArray.put(obj);
            } catch (Exception ignored) {}
        }

        JSObject result = new JSObject();
        result.put("devices", pairedArray);
        call.resolve(result);
    }

    private void startDiscovery(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Bluetooth not supported");
            return;
        }

        // Check location permission (required for discovery on Android 6+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("location", call, "startDiscoveryPerm");
                return;
            }
        }

        // Check Bluetooth permissions (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_SCAN)
                != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("bluetooth", call, "startDiscoveryPerm");
                return;
            }
        }

        discoveredDevices.clear();
        isScanning = true;

        // Register receiver for found devices
        discoveryReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();

                if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (device != null) {
                        JSONObject obj = new JSONObject();
                        try {
                            String name = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                                ? (ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
                                    ? device.getName() : "Unknown")
                                : device.getName();
                            obj.put("name", name != null ? name : "Unknown");
                            obj.put("address", device.getAddress());
                            obj.put("paired", false);
                        } catch (Exception ignored) {}

                        // Deduplicate
                        boolean exists = false;
                        for (JSONObject d : discoveredDevices) {
                            try {
                                if (d.getString("address").equals(device.getAddress())) { exists = true; break; }
                            } catch (Exception ignored) {}
                        }
                        if (!exists) {
                            discoveredDevices.add(obj);
                        }

                        // Send progress update to JS
                        JSObject progress = new JSObject();
                        progress.put("type", "device_found");
                        progress.put("device", obj);
                        notifyListeners("onDeviceFound", progress);
                    }
                } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                    isScanning = false;
                    try { getContext().unregisterReceiver(this); } catch (Exception ignored) {}

                    if (call != null) {
                        JSONArray arr = new JSONArray();
                        for (JSONObject d : discoveredDevices) arr.put(d);

                        JSObject result = new JSObject();
                        result.put("devices", arr);
                        call.resolve(result);
                    }
                }
            }
        };

        // Register receiver
        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        getContext().registerReceiver(discoveryReceiver, filter);

        // Cancel any ongoing discovery
        if (adapter.isDiscovering()) {
            adapter.cancelDiscovery();
        }

        // Start discovery
        boolean started = adapter.startDiscovery();
        if (!started) {
            call.reject("Failed to start Bluetooth discovery");
            return;
        }

        // Return scanning started
        JSObject startedMsg = new JSObject();
        startedMsg.put("type", "scan_started");
        notifyListeners("onDeviceFound", startedMsg);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_ENABLE_BT) {
            if (resultCode == android.app.Activity.RESULT_OK && pendingScanCall != null) {
                startDiscovery(pendingScanCall);
                pendingScanCall = null;
            } else if (pendingScanCall != null) {
                pendingScanCall.reject("Bluetooth not enabled");
                pendingScanCall = null;
            }
        }
    }

    @Override
    protected void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.handleRequestPermissionsResult(requestCode, permissions, grantResults);
        // Capacitor handles permission results via the @Permission annotation
    }

    @Override
    protected void handleOnDestroy() {
        if (discoveryReceiver != null && isScanning) {
            try { getContext().unregisterReceiver(discoveryReceiver); } catch (Exception ignored) {}
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter != null && adapter.isDiscovering()) {
            adapter.cancelDiscovery();
        }
        super.handleOnDestroy();
    }
}
