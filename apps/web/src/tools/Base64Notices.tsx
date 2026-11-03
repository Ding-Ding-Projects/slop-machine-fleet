import React from "react";
import { useUI } from "../preferences";
import nobleLicense from "../../../../packages/shared/local-base64/licenses/noble-hashes-MIT.txt?raw";
import zipLicense from "../../../../packages/shared/local-base64/licenses/fflate-MIT.txt?raw";
export function Base64Notices() {
  const { t } = useUI();
  return (
    <details>
      <summary>{t("Bundled dependency licences", "已附元件授權條款")}</summary>
      <h4>@noble/hashes 2.0.1</h4>
      <pre>{nobleLicense}</pre>
      <h4>fflate 0.8.2</h4>
      <pre>{zipLicense}</pre>
    </details>
  );
}
