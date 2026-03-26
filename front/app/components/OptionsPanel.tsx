import React from "react";
import type { TranslatorKey } from "@/types";
import { validTranslators } from "@/types";
import { getTranslatorName } from "@/utils/getTranslatorName";
import {
  languageOptions,
  detectionResolutions,
  textDetectorOptions,
} from "@/config";
import { LabeledSelect } from "@/components/LabeledSelect";

type Props = {
  detectionResolution: string;
  textDetector: string;
  renderTextDirection: string;
  translator: TranslatorKey;
  targetLanguage: string;

  setDetectionResolution: (val: string) => void;
  setTextDetector: (val: string) => void;
  setRenderTextDirection: (val: string) => void;
  setTranslator: (val: TranslatorKey) => void;
  setTargetLanguage: (val: string) => void;
};

export const OptionsPanel: React.FC<Props> = ({
  detectionResolution,
  textDetector,
  renderTextDirection,
  translator,
  targetLanguage,
  setDetectionResolution,
  setTextDetector,
  setRenderTextDirection,
  setTranslator,
  setTargetLanguage,
}) => {
  return (
    <>
      {/* 1段目のセクション */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Detection Resolution */}
        <LabeledSelect
          id="detectionResolution"
          label="Detection Resolution"
          icon="carbon:fit-to-screen"
          title="Detection resolution"
          value={detectionResolution}
          onChange={setDetectionResolution}
          options={detectionResolutions.map((res) => ({
            label: `${res}px`,
            value: String(res),
          }))}
        />

        {/* Text Detector */}
        <LabeledSelect
          id="textDetector"
          label="Text Detector"
          icon="carbon:search-locate"
          title="Text detector"
          value={textDetector}
          onChange={setTextDetector}
          options={textDetectorOptions.map((o) => ({ value: o.value, label: o.label.en }))}
        />

        {/* Render text direction */}
        <LabeledSelect
          id="renderTextDirection"
          label="Render Direction"
          icon="carbon:text-align-left"
          title="Render text orientation"
          value={renderTextDirection}
          onChange={setRenderTextDirection}
          options={[
            { value: "auto", label: "Auto" },
            { value: "horizontal", label: "Horizontal" },
            { value: "vertical", label: "Vertical" },
          ]}
        />

        {/* Translator */}
        <LabeledSelect
          id="translator"
          label="Translator"
          icon="carbon:operations-record"
          title="Translator"
          value={translator}
          onChange={(val) => setTranslator(val as TranslatorKey)}
          options={validTranslators.map((key) => ({
            value: key,
            label: getTranslatorName(key),
          }))}
        />

        {/* Target Language */}
        <LabeledSelect
          id="targetLanguage"
          label="Target Language"
          icon="carbon:language"
          title="Target language"
          value={targetLanguage}
          onChange={setTargetLanguage}
          options={languageOptions}
        />
      </div>

    </>
  );
};
