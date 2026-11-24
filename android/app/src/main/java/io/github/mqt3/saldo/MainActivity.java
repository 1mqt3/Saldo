package io.github.mqt3.saldo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaldoAndroidPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
