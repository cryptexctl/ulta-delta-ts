import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as zlib from 'zlib';
import axios from 'axios';
import * as yargs from 'yargs';

interface VpnConfig {
  api_key: string;
  [key: string]: any;
}

const decodeVpnLink = (vpnKeyStr: string): VpnConfig => {
  if (vpnKeyStr.startsWith('vpn://')) {
    vpnKeyStr = vpnKeyStr.slice(6);
  }

  const paddingNeeded = vpnKeyStr.length % 4;
  if (paddingNeeded) {
    vpnKeyStr += '='.repeat(4 - paddingNeeded);
  }

  try {
    const buffer = Buffer.from(vpnKeyStr, 'base64');
    let decompressed: Buffer | undefined;
        const decompressionMethods = [
      () => zlib.inflateSync(buffer.slice(4)),
      () => zlib.inflateRawSync(buffer.slice(4)),
      () => zlib.gunzipSync(buffer.slice(4)),
      () => zlib.inflateSync(buffer),
      () => zlib.inflateRawSync(buffer),
      () => zlib.gunzipSync(buffer)
    ];
    
    for (const method of decompressionMethods) {
      try {
        decompressed = method();
        break;
      } catch (err) {
      }
    }
    
    if (!decompressed) {
      throw new Error('Could not decompress data with any known method');
    }
    
    return JSON.parse(decompressed.toString());
  } catch (e) {
    throw new Error(`Failed to decode VPN link: ${e}`);
  }
};

const fetchConfig = async (apiKey: string): Promise<string> => {
  if (!apiKey) {
    throw new Error('API key is required');
  }

  const url = `https://api.ultvs.click/client-api/v1/download-awg-key?public_request_id=${apiKey}`;
  const headers = {
    'X-Device-Id': uuidv4(),
    'User-Agent': 'ulta-android/1.2.2.37'
  };

  try {
    const response = await axios.get(url, { headers });
    
    if (typeof response.data === 'string') {
      return response.data;
    }
    
    if (response.data.data) {
      return response.data.data;
    } else {
      const errorMsg = response.data.error?.localized_message || 'Unknown error';
      throw new Error(`API error: ${errorMsg}`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`HTTP Error: ${error.response?.status} ${error.response?.statusText || error.message}`);
    }
    throw error;
  }
};

const saveConfig = (config: string, filename: string): string => {
  fs.writeFileSync(filename, config);
  return filename;
};

const main = async () => {
  const argv = yargs
    .scriptName('ulta-delta-ts')
    .usage('$0 <vpn_link> [options]')
    .positional('vpn_link', {
      describe: 'VPN key starting with vpn://',
      type: 'string',
      demandOption: true
    })
    .option('gc', {
      alias: 'get-conf',
      describe: 'Fetch WG config from API',
      type: 'boolean'
    })
    .option('o', {
      alias: 'output',
      describe: 'Save WireGuard config to file',
      type: 'string'
    })
    .help('h')
    .alias('h', 'help')
    .parseSync();

  try {
    const vpnLink = argv._[0] as string;
    if (!vpnLink) {
      throw new Error('VPN key is required');
    }

    const conf = decodeVpnLink(vpnLink);
    console.log('[i] Decoded VPN Key:\n', JSON.stringify(conf, null, 2));

    if (argv.gc) {
      console.log('\n[i] Fetching .conf from API...');
      const wgConf = await fetchConfig(conf.api_key);
      console.log('\n[+] WireGuard Config:\n', wgConf);

      if (argv.o) {
        const savedFile = saveConfig(wgConf, argv.o);
        console.log(`\n[+] Config saved to: ${savedFile}`);
      }
    }

    return 0;
  } catch (e) {
    console.error(`[!] Error: ${e instanceof Error ? e.message : e}`);
    return 1;
  }
};

main().catch(err => {
  console.error('[!] Unhandled error:', err);
  process.exit(1);
}); 