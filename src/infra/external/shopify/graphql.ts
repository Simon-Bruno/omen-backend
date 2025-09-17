import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import { ProjectDAL } from '../../dal';
import { decrypt } from '../../encryption';


const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET!,
    scopes: ['read_products, read_themes'],
    hostName: 'ngrok-tunnel-address',
    apiVersion: ApiVersion.July25,
    isEmbeddedApp: false,

});

const getDefaultProjectInfo = async () => {
    const projectInfo = await ProjectDAL.getProjectById("cmfnzk7mh0001qjm3ujts5g08");

    if (!projectInfo) {
        throw new Error("Project not found");
    }

    // Log all variables to check if they are correct
    console.log("Project info:", projectInfo);
    console.log("Shop domain:", projectInfo.shopDomain);
    console.log("Access token:", projectInfo.accessTokenEnc);
    console.log("Key:", process.env.SHOPIFY_API_KEY);
    console.log("Secret:", process.env.SHOPIFY_API_SECRET);

    const session = new Session({
        id: `offline_${projectInfo.shopDomain}`, // offline token format; if online, use a unique session ID
        shop: projectInfo.shopDomain,
        state: "state",
        isOnline: false, // true if using an online token
        accessToken: decrypt(projectInfo.accessTokenEnc),
    });

    if (!session) {
        throw new Error("Session not found");
    }

    const client = new shopify.clients.Graphql({ session });

    const data = await client.query({
        data: `query GetThemes {
  themes(first: 10) {
    edges {
      node {
        id
        name
        role
        themeStoreId
        updatedAt
      }
    }
  }
}
  `,
    });

    const themes = data.body.data.themes.edges;
    const mainTheme = themes.find(edge => edge.node.role === "MAIN").node;


    return mainTheme

}


export default getDefaultProjectInfo;