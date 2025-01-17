// @ts-nocheck
/* eslint-env node, browser, jasmine */
import { describe, it, expect, beforeAll } from "vitest"
import { makeFixture } from "./makeFixture.js"
import { readTag } from "isomorphic-git"

describe("readTag", () => {
	it("annotated tag", async () => {
		// Setup
		const { fs, gitdir } = await makeFixture("test-readTag")
		// Test
		const tag = await readTag({
			fs,
			gitdir,
			oid: "587d3f8290b513e2ee85ecd317e6efecd545aee6",
		})
		expect(tag).toMatchInlineSnapshot(`
      {
        "oid": "587d3f8290b513e2ee85ecd317e6efecd545aee6",
        "payload": "object 033417ae18b174f078f2f44232cb7a374f4c60ce
      type commit
      tag mytag
      tagger William Hilton <wmhilton@gmail.com> 1578802395 -0500

      This is a tag message.

      ",
        "tag": {
          "gpgsig": undefined,
          "message": "This is a tag message.
      ",
          "object": "033417ae18b174f078f2f44232cb7a374f4c60ce",
          "tag": "mytag",
          "tagger": {
            "email": "wmhilton@gmail.com",
            "name": "William Hilton",
            "timestamp": 1578802395,
            "timezoneOffset": 300,
          },
          "type": "commit",
        },
      }
    `)
	})
})
