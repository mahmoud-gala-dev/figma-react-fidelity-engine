import fs from 'node:fs';
import path from 'node:path';
import { deflateSync, zipSync } from 'fflate';
import { compileSchema, encodeBinarySchema, parseSchema } from 'kiwi-schema';

const KIWI_SCHEMA_TEXT = `
package figma;

struct Guid {
  uint sessionID;
  uint localID;
}

struct ParentIndex {
  Guid guid;
  string position;
}

struct Vector {
  float x;
  float y;
}

struct Matrix {
  float m00;
  float m01;
  float m02;
  float m10;
  float m11;
  float m12;
}

struct Color {
  float r;
  float g;
  float b;
  float a;
}

struct Paint {
  string type;
  bool visible;
  float opacity;
  Color color;
  string blendMode;
}

struct FontName {
  string family;
  string style;
}

struct NumberWithUnits {
  float value;
  string units;
}

struct TextData {
  string characters;
}

message NodeChange {
  Guid guid = 1;
  string phase = 2;
  ParentIndex parentIndex = 3;
  string type = 4;
  string name = 5;
  bool visible = 6;
  float opacity = 7;
  Vector size = 8;
  Matrix transform = 9;
  Paint[] fillPaints = 10;
  Paint[] strokePaints = 11;
  float strokeWeight = 12;
  string strokeAlign = 13;
  float cornerRadius = 14;
  FontName fontName = 15;
  float fontSize = 16;
  NumberWithUnits lineHeight = 17;
  NumberWithUnits letterSpacing = 18;
  TextData textData = 19;
  string textAlignHorizontal = 20;
  string textAlignVertical = 21;
  string stackMode = 22;
  float stackSpacing = 23;
  float stackVerticalPadding = 24;
  float stackHorizontalPadding = 25;
  float stackPaddingRight = 26;
  float stackPaddingBottom = 27;
  string stackPrimaryAlignItems = 28;
  string stackCounterAlignItems = 29;
  string stackPrimarySizing = 30;
  string stackCounterSizing = 31;
  string componentKey = 32;
  bool internalOnly = 33;
}

message Message {
  NodeChange[] nodeChanges = 1;
}
`;

export function buildSampleFigBytes({
  fileName = 'Figma Fidelity Reference Design',
  width = 112,
  height = 100,
  text = 'Buy ice cream',
  backgroundColor = { r: 1, g: 154 / 255, b: 98 / 255, a: 1 },
  cornerRadius = 6,
} = {}) {
  const schema = parseSchema(KIWI_SCHEMA_TEXT);
  const compiled = compileSchema(schema);
  const schemaCompressed = deflateSync(new Uint8Array(encodeBinarySchema(schema)));

  const message = {
    nodeChanges: [
      {
        guid: { sessionID: 0, localID: 0 },
        phase: 'CREATED',
        type: 'DOCUMENT',
        name: 'Document',
        visible: true,
      },
      {
        guid: { sessionID: 0, localID: 1 },
        phase: 'CREATED',
        parentIndex: { guid: { sessionID: 0, localID: 0 }, position: '!' },
        type: 'CANVAS',
        name: 'Page 1 — Design Components',
        visible: true,
        internalOnly: false,
      },
      {
        guid: { sessionID: 942, localID: 2734 },
        phase: 'CREATED',
        parentIndex: { guid: { sessionID: 0, localID: 1 }, position: '!' },
        type: 'FRAME',
        name: 'Buy ice cream',
        visible: true,
        opacity: 1,
        size: { x: width, y: height },
        transform: { m00: 1, m01: 0, m02: 452, m10: 0, m11: 1, m12: 1216 },
        fillPaints: [
          {
            type: 'SOLID',
            visible: true,
            opacity: 1,
            color: backgroundColor,
            blendMode: 'NORMAL',
          },
        ],
        strokePaints: [
          {
            type: 'SOLID',
            visible: true,
            opacity: 1,
            color: { r: 0.11, g: 0.11, b: 0.15, a: 1 },
            blendMode: 'NORMAL',
          },
        ],
        strokeWeight: 0,
        strokeAlign: 'INSIDE',
        cornerRadius,
        fontName: { family: 'Arial', style: 'Regular' },
        fontSize: 14,
        lineHeight: { value: 20, units: 'PIXELS' },
        textData: { characters: text },
        textAlignHorizontal: 'CENTER',
        textAlignVertical: 'CENTER',
        stackMode: 'HORIZONTAL',
        stackSpacing: 8,
        stackVerticalPadding: 10,
        stackHorizontalPadding: 10,
        stackPaddingRight: 10,
        stackPaddingBottom: 10,
        stackPrimaryAlignItems: 'CENTER',
        stackCounterAlignItems: 'CENTER',
        stackPrimarySizing: 'FIXED',
        stackCounterSizing: 'FIXED',
      },
      {
        guid: { sessionID: 942, localID: 2735 },
        phase: 'CREATED',
        parentIndex: { guid: { sessionID: 942, localID: 2734 }, position: '!' },
        type: 'TEXT',
        name: 'Label',
        visible: true,
        opacity: 1,
        size: { x: 92, y: 20 },
        transform: { m00: 1, m01: 0, m02: 10, m10: 0, m11: 1, m12: 40 },
        fillPaints: [
          {
            type: 'SOLID',
            visible: true,
            opacity: 1,
            color: { r: 0.11, g: 0.11, b: 0.15, a: 1 },
            blendMode: 'NORMAL',
          },
        ],
        fontName: { family: 'Arial', style: 'Regular' },
        fontSize: 14,
        lineHeight: { value: 20, units: 'PIXELS' },
        textData: { characters: text },
        textAlignHorizontal: 'CENTER',
        textAlignVertical: 'CENTER',
      },
      {
        guid: { sessionID: 1, localID: 2 },
        phase: 'CREATED',
        parentIndex: { guid: { sessionID: 0, localID: 1 }, position: '"' },
        type: 'SYMBOL',
        name: 'Primary Action Card',
        visible: true,
        opacity: 1,
        size: { x: 160, y: 64 },
        transform: { m00: 1, m01: 0, m02: 600, m10: 0, m11: 1, m12: 1216 },
        fillPaints: [
          {
            type: 'SOLID',
            visible: true,
            opacity: 1,
            color: { r: 0.145, g: 0.388, b: 0.922, a: 1 },
            blendMode: 'NORMAL',
          },
        ],
        cornerRadius: 8,
        componentKey: 'comp-primary-action-card',
        stackMode: 'HORIZONTAL',
        stackSpacing: 12,
        stackVerticalPadding: 12,
        stackHorizontalPadding: 16,
        stackPaddingRight: 16,
        stackPaddingBottom: 12,
        stackPrimaryAlignItems: 'CENTER',
        stackCounterAlignItems: 'CENTER',
      },
    ],
  };

  const messageCompressed = deflateSync(new Uint8Array(compiled.encodeMessage(message)));
  const prelude = new TextEncoder().encode('fig-kiwi');
  const totalSize = 12 + 4 + schemaCompressed.byteLength + 4 + messageCompressed.byteLength;
  const canvasFig = new Uint8Array(totalSize);
  const view = new DataView(canvasFig.buffer);
  canvasFig.set(prelude, 0);
  view.setUint32(8, 48, true);
  let offset = 12;
  view.setUint32(offset, schemaCompressed.byteLength, true);
  offset += 4;
  canvasFig.set(schemaCompressed, offset);
  offset += schemaCompressed.byteLength;
  view.setUint32(offset, messageCompressed.byteLength, true);
  offset += 4;
  canvasFig.set(messageCompressed, offset);

  const metaBytes = new TextEncoder().encode(
    JSON.stringify({
      file_name: fileName,
      exported_at: '2026-11-04T18:00:00.000Z',
    })
  );

  return zipSync({
    'canvas.fig': [canvasFig, { level: 0 }],
    'meta.json': [metaBytes, { level: 0 }],
  });
}

export function ensureSampleFigFixture(targetPath = path.resolve('fixtures/sample-design.fig')) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const bytes = buildSampleFigBytes();
  fs.writeFileSync(targetPath, bytes);
  return { path: targetPath, byteLength: bytes.byteLength };
}

