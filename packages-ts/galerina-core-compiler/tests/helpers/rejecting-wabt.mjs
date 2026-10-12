export default async function createRejectingWabt() {
  return {
    parseWat() {
      throw new Error("controlled WABT rejection");
    },
  };
}
