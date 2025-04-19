import { Plugin, ServerAPI } from "@signalk/server-api";
import { IRouter } from "express";

interface Settings {
  sart_mmsi: number;
  auto_increment_sart_mmsi: boolean;
}

interface SendResult {
  success: boolean;
  message: string;
}

module.exports = (app: ServerAPI): Plugin => {
  let settings: Settings = {
    sart_mmsi: 970000001,
    auto_increment_sart_mmsi: true,
  };
  let currentMMSI: number;

  const plugin: Plugin = {
    id: "signalk-ais-sart-opencpn-mob-plugin",
    name: "AIS SART MOB trigger",
    start: (s, restartPlugin) => {
      settings = s as Settings;
      currentMMSI = settings.sart_mmsi || 970000001;
    },
    stop: () => {
      // shutdown code goes here.
    },
    registerWithRouter: (router: IRouter) => {
      router.post("/trigger", (req, res) => {
        let outputMMSI: string;
        if (req.body.mmsi) {
          outputMMSI = req.body.mmsi;
        } else {
          outputMMSI = currentMMSI.toString();
        }

        const r = sendAisSartUpdate(app, outputMMSI);
        let statusCode = 200;
        if (r.success) {
          app.debug(r.message);
          if (!req.body.mmsi && settings.auto_increment_sart_mmsi) {
            currentMMSI += 1;
          }
        } else {
          app.error(r.message);
          statusCode = 400;
        }

        res.status(statusCode).json({
          success: r.success,
          message: r.message,
          mmsi: outputMMSI,
        });
      });
    },
    schema: () => {
      return {
        properties: {
          sart_mmsi: {
            type: "number",
            title: "MMSI number for the AIS-SART device",
            default: 970000001,
            minimum: 970000000,
            maximum: 979999999,
          },
          auto_increment_sart_mmsi: {
            type: "boolean",
            title: "Auto increment MMSI on each trigger (resets back to the value above on server restart)",
            default: true,
          },
        },
      };
    },
  };

  function sendAisSartUpdate(app: ServerAPI, mmsi: string): SendResult {
    const position = app.getSelfPath("navigation.position");
    if (!position || !position.value) {
      return {
        success: false,
        message: "Unable to emit event. No position found.",
      };
    }

    const cog = app.getSelfPath("navigation.courseOverGroundTrue");
    const hdt = app.getSelfPath("navigation.headingTrue");

    const update = {
      context: `vessels.urn:mrn:imo:mmsi:${mmsi}`,
      updates: [
        {
          source: {
            type: "plugin",
            label: plugin.id,
            src: mmsi,
          },
          timestamp: new Date().toISOString(),
          values: [
            {
              path: "navigation.position",
              value: position.value,
            },
            {
              path: "navigation.state",
              value: "ais-sart",
            },
            {
              path: "navigation.courseOverGroundTrue",
              value: cog?.value || 0,
            },
            {
              path: "navigation.speedOverGround",
              value: 0,
            },
            {
              path: "navigation.headingTrue",
              value: hdt?.value || 0,
            },
            {
              path: "design.aisShipType",
              value: {
                id: 14, // SAR aircraft or MOB device
                name: "AIS SART",
              },
            },
            {
              path: "",
              value: {
                name: "AIS SART MOB",
                mmsi: mmsi,
              },
            },
          ],
        },
      ],
    };

    app.handleMessage(plugin.id, update);
    return {
      success: true,
      message: "AIS SART message sent",
    };
  }

  return plugin;
};
