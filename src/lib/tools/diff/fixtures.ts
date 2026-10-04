// Expected output from GNU diffutils 3.10: diff -u --label original --label changed a b
export const gnuCases: Record<string, { a: string; b: string; u: string }> = {
	multi: {
		a: 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\nline 11\nline 12\nline 13\nline 14\nline 15\nline 16\nline 17\nline 18\nline 19\nline 20\n',
		b: 'line 1\nline 2 changed\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\ninserted\nline 11\nline 12\nline 13\nline 14\nline 15\nline 16\nline 17\nline 19\nline 20\n',
		u: '--- original\n+++ changed\n@@ -1,5 +1,5 @@\n line 1\n-line 2\n+line 2 changed\n line 3\n line 4\n line 5\n@@ -8,6 +8,7 @@\n line 8\n line 9\n line 10\n+inserted\n line 11\n line 12\n line 13\n@@ -15,6 +16,5 @@\n line 15\n line 16\n line 17\n-line 18\n line 19\n line 20\n'
	},
	addEmpty: {
		a: '',
		b: 'one\ntwo\n',
		u: '--- original\n+++ changed\n@@ -0,0 +1,2 @@\n+one\n+two\n'
	},
	delAll: {
		a: 'one\ntwo\n',
		b: '',
		u: '--- original\n+++ changed\n@@ -1,2 +0,0 @@\n-one\n-two\n'
	},
	insertTop: {
		a: 'a\nb\nc\nd\ne\n',
		b: 'new\na\nb\nc\nd\ne\n',
		u: '--- original\n+++ changed\n@@ -1,3 +1,4 @@\n+new\n a\n b\n c\n'
	},
	insertMiddleNoCtxDel: {
		a: 'a\nb\nc\nd\ne\nf\ng\nh\n',
		b: 'a\nb\nc\nd\nX\ne\nf\ng\nh\n',
		u: '--- original\n+++ changed\n@@ -2,6 +2,7 @@\n b\n c\n d\n+X\n e\n f\n g\n'
	},
	noeol: {
		a: 'a\nb\nc',
		b: 'a\nb\nd',
		u: '--- original\n+++ changed\n@@ -1,3 +1,3 @@\n a\n b\n-c\n\\ No newline at end of file\n+d\n\\ No newline at end of file\n'
	},
	eolAdded: {
		a: 'a\nb\nc',
		b: 'a\nb\nc\n',
		u: '--- original\n+++ changed\n@@ -1,3 +1,3 @@\n a\n b\n-c\n\\ No newline at end of file\n+c\n'
	},
	single: {
		a: 'x\n',
		b: 'y\n',
		u: '--- original\n+++ changed\n@@ -1 +1 @@\n-x\n+y\n'
	},
	far: {
		a: '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n20\n21\n22\n23\n24\n25\n26\n27\n28\n29\n30\n',
		b: '1\n2\nz\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n20\n21\n22\n23\n24\nz\n26\n27\n28\n29\n30\n',
		u: '--- original\n+++ changed\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+z\n 4\n 5\n 6\n@@ -22,7 +22,7 @@\n 22\n 23\n 24\n-25\n+z\n 26\n 27\n 28\n'
	}
};
