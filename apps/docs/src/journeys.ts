export const journeys = [
  {
    id: "setup",
    title: ["Set up with confidence", "安心完成設定"],
    intro: [
      "Establish a trusted controller before creating paid infrastructure.",
      "建立可信任的控制器後，才建立收費基礎設施。",
    ],
    steps: [
      {
        title: ["Choose your controller host", "選擇控制器主機"],
        body: [
          "Use a trusted LAN host, preserve its database volumes, and plan the HTTPS origin that every client will use. The documentation does not provision a host for you.",
          "使用可信任的區域網絡主機，保留資料庫磁碟區，並規劃所有用戶端使用的 HTTPS 來源。文件不會代你建立主機。",
        ],
        article: "docs/features/fleet/setup",
      },
      {
        title: ["Establish trust and sign in", "建立信任並登入"],
        body: [
          "Complete the protected first-owner flow and trust the actual deployment certificate. Never disable certificate verification to make connection errors disappear.",
          "完成受保護的首次擁有者流程，信任實際部署憑證，切勿停用憑證驗證來隱藏連線錯誤。",
        ],
        article: "docs/features/fleet/authentication",
      },
      {
        title: ["Verify the productive workspace", "驗證工作介面"],
        body: [
          "Confirm service health, sign in and reopen the fleet from another intended LAN client. A response from localhost alone does not prove LAN reachability.",
          "確認服務健康狀態並登入，再從另一個預定區域網絡用戶端開啟叢集。只有本機回應並不代表區域網絡可連線。",
        ],
        article: "docs/features/fleet/setup",
      },
    ],
  },
  {
    id: "provision",
    title: ["Create a worker deliberately", "審慎建立工作節點"],
    intro: [
      "Review scope, access and cost before any cloud operation.",
      "執行雲端操作前，先查看範圍、存取權及費用。",
    ],
    steps: [
      {
        title: ["Review the intended resources", "審視預定資源"],
        body: [
          "Choose the region, machine size and capacity required by the task. Treat estimates as estimates, not a final bill.",
          "選擇工作所需的區域、機器規格及容量。估算只是估算，並非最終帳單。",
        ],
        article: "docs/features/fleet/provisioning",
      },
      {
        title: ["Confirm access and cost", "確認存取權及費用"],
        body: [
          "Use the installed application’s explicit review step. This guide neither accepts credentials nor creates an instance.",
          "使用已安裝應用程式的明確審核步驟。本指南不接收憑證，也不建立執行個體。",
        ],
        article: "docs/features/fleet/provisioning",
      },
      {
        title: ["Observe the real operation", "觀察實際操作"],
        body: [
          "Read the recorded operation result and worker state. Queued, provisioning, ready and failed are different outcomes; a submitted request is not proof of readiness.",
          "查看已記錄的操作結果及節點狀態。排隊、建立中、就緒及失敗是不同結果，提交要求不代表已就緒。",
        ],
        article: "docs/features/fleet/lifecycle",
      },
    ],
  },
  {
    id: "recover",
    title: ["Supervise and recover safely", "安全監察及復原"],
    intro: [
      "Understand task handoff, worker lifecycle and preservation before retrying.",
      "重試前先了解工作交接、節點生命週期及保留資料的方法。",
    ],
    steps: [
      {
        title: ["Inspect the task evidence", "查看工作證據"],
        body: [
          "Read the task and operation records before deciding what to retry. Distinguish requested work from observed completion.",
          "決定重試項目前先閱讀工作及操作紀錄，區分已提出要求與已觀察到的完成狀態。",
        ],
        article: "docs/features/fleet/tasks",
      },
      {
        title: ["Choose the narrow recovery", "選擇最小復原範圍"],
        body: [
          "Retry the failed phase without deleting persistent storage or unrelated workers. Keep previous usable configuration available.",
          "重試失敗階段時，不要刪除持久儲存或無關節點，並保留之前可用的設定。",
        ],
        article: "docs/features/fleet/lifecycle",
      },
      {
        title: ["Verify the resulting state", "驗證結果狀態"],
        body: [
          "Confirm the new recorded state and preserve a useful handoff. A retry button changes a request, not the truth of the final result.",
          "確認新的記錄狀態，並保留有用的交接資料。重試按鈕只更改要求，不能代替最終結果的驗證。",
        ],
        article: "docs/features/fleet/tasks",
      },
    ],
  },
] as const;
export const categories = [
  {
    id: "operations",
    name: ["Operate the fleet", "管理叢集"],
    description: [
      "Set up trusted access, provision workers and understand lifecycle outcomes.",
      "設定可信任存取、建立節點並了解生命週期結果。",
    ],
  },
  {
    id: "tools",
    name: ["Transform files locally", "本機檔案轉換"],
    description: [
      "Learn supported local conversions, safety limits and unavailable formats.",
      "了解支援的本機轉換、安全上限及未提供格式。",
    ],
  },
  {
    id: "requirements",
    name: ["Understand delivery requirements", "了解交付要求"],
    description: [
      "Read required behavior and acceptance boundaries. A requirement is not an implementation claim.",
      "閱讀所需行為及驗證界線，列出要求不代表已實作。",
    ],
  },
  {
    id: "wiki",
    name: ["Explore the project wiki", "瀏覽專案維基"],
    description: [
      "Read all prepared wiki pages here. Forge publication may still be pending.",
      "在此閱讀所有已備妥的維基頁面，原平台發佈可能仍未完成。",
    ],
  },
  {
    id: "reference",
    name: ["Consult reference material", "查閱參考資料"],
    description: [
      "Read API details, project context and complete source articles.",
      "閱讀 API 詳情、專案背景及完整來源文章。",
    ],
  },
];
