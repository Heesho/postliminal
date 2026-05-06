import type { NodeData, ProjectState } from "@/types/project";

const DB_NAME = "postliminal.generatedImages";
const DB_VERSION = 1;
const STORE_NAME = "images";

type StoredImage = {
  key: string;
  projectId: string;
  nodeId: string;
  index: number;
  imageUrl: string;
  updatedAt: string;
};

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function generatedImageUrls(data: NodeData) {
  return Array.isArray(data.generatedImageUrls)
    ? data.generatedImageUrls.filter(
        (imageUrl): imageUrl is string => typeof imageUrl === "string",
      )
    : [];
}

function generatedImageRefs(data: NodeData) {
  return Array.isArray(data.generatedImageRefs)
    ? data.generatedImageRefs.filter(
        (imageRef): imageRef is string => typeof imageRef === "string",
      )
    : [];
}

function hasInlineImageUrls(imageUrls: string[]) {
  return imageUrls.some((imageUrl) => imageUrl.startsWith("data:image/"));
}

function storesGeneratedImages(nodeType: string) {
  return nodeType === "image_generation" || nodeType === "background_removal";
}

function imageStorageKey(projectId: string, nodeId: string, index: number) {
  return `${projectId}:${nodeId}:${index}`;
}

function refsForImages(projectId: string, nodeId: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    imageStorageKey(projectId, nodeId, index),
  );
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getStoredImage(db: IDBDatabase, key: string) {
  return new Promise<StoredImage | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result as StoredImage | undefined);
    request.onerror = () => reject(request.error);
  });
}

export function projectWithoutInlineGeneratedImages(
  project: ProjectState,
): ProjectState {
  return {
    ...project,
    nodes: project.nodes.map((node) => {
      if (!storesGeneratedImages(node.type)) return node;

      const imageUrls = generatedImageUrls(node.data);
      if (!hasInlineImageUrls(imageUrls)) return node;

      if (imageUrls.length === 0) {
        if (node.data.generatedImageCount === undefined) return node;

        const data: NodeData = { ...node.data };
        delete data.generatedImageCount;

        return {
          ...node,
          data,
        };
      }

      const data: NodeData = {
        ...node.data,
        generatedImageRefs: refsForImages(project.projectId, node.id, imageUrls.length),
      };

      delete data.generatedImageUrls;
      delete data.generatedImageCount;

      return {
        ...node,
        data,
      };
    }),
  };
}

export async function saveProjectGeneratedImages(project: ProjectState) {
  const records = project.nodes.flatMap((node) => {
    if (!storesGeneratedImages(node.type)) return [];

    return generatedImageUrls(node.data).map((imageUrl, index) => ({
      key: imageStorageKey(project.projectId, node.id, index),
      projectId: project.projectId,
      nodeId: node.id,
      index,
      imageUrl,
      updatedAt: node.updatedAt,
    }));
  });

  if (records.length === 0 || !canUseIndexedDb()) return;

  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    records.forEach((record) => {
      store.put(record);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  db.close();
}

export async function hydrateProjectGeneratedImages(project: ProjectState) {
  const nodesWithRefs = project.nodes.filter(
    (node) =>
      storesGeneratedImages(node.type) && generatedImageRefs(node.data).length > 0,
  );

  if (nodesWithRefs.length === 0 || !canUseIndexedDb()) return project;

  const db = await openDatabase();
  let changed = false;

  const nodes = await Promise.all(
    project.nodes.map(async (node) => {
      if (!storesGeneratedImages(node.type)) return node;

      const refs = generatedImageRefs(node.data);
      if (refs.length === 0) return node;

      const records = await Promise.all(refs.map((ref) => getStoredImage(db, ref)));
      const imageUrls = records
        .map((record) => record?.imageUrl)
        .filter((imageUrl): imageUrl is string => typeof imageUrl === "string");

      if (imageUrls.length === 0) return node;

      changed = true;
      return {
        ...node,
        data: {
          ...node.data,
          generatedImageCount: imageUrls.length,
          generatedImageUrls: imageUrls,
        },
      };
    }),
  );

  db.close();

  return changed ? { ...project, nodes } : project;
}
