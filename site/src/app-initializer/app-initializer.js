import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { storage } from "../data/storage";
import { pubsub } from "../data/pubsub";
import { loadingScreenManager } from "../loading-screen/loading-screen-manager";

export class AppInitializer extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{app-initializer.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.initializeApp();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanup();
  }

  cleanup() {
    api.disable();
    // Unpublish everything to prevent any data leaking over into another session
    pubsub.unpublishAll();
    loadingScreenManager.hideLoadingScreen();
  }

  async initializeApp() {
    this.cleanup();
    loadingScreenManager.showLoadingScreen();
    const group = storage.getGroup();

    api.setCredentials(group.groupName, group.groupToken);
    await api.refreshMembers();

    // Make sure this component is still connected after loading. We don't want to leave the
    // loading screen up forever if the user navigated away before this completed.
    if (this.isConnected) {
      loadingScreenManager.hideLoadingScreen();
    }
  }
}

customElements.define("app-initializer", AppInitializer);
