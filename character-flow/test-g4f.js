import { G4F } from "g4f";

const g4f = new G4F();
async function test() {
  const messages = [{ role: "user", content: "Hello" }];
  const response = await g4f.chatCompletion(messages);
  console.log(response);
}
test().catch(console.error);
