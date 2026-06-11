var utf8 = {};
var hasRequiredUtf8;
function requireUtf8() {
  if (hasRequiredUtf8) return utf8;
  hasRequiredUtf8 = 1;
  (function(exports$1) {
    var utf82 = exports$1, replacementChar = "�";
    utf82.length = function utf8_length(string) {
      var len = 0, c = 0;
      for (var i = 0; i < string.length; ++i) {
        c = string.charCodeAt(i);
        if (c < 128)
          len += 1;
        else if (c < 2048)
          len += 2;
        else if ((c & 64512) === 55296 && (string.charCodeAt(i + 1) & 64512) === 56320) {
          ++i;
          len += 4;
        } else
          len += 3;
      }
      return len;
    };
    utf82.read = function utf8_read(buffer, start, end) {
      if (end - start < 1) {
        return "";
      }
      var str = "";
      for (var i = start; i < end; ) {
        var t = buffer[i++];
        if (t <= 127) {
          str += String.fromCharCode(t);
        } else if (t >= 192 && t < 224) {
          var c2 = (t & 31) << 6 | buffer[i++] & 63;
          str += c2 >= 128 ? String.fromCharCode(c2) : replacementChar;
        } else if (t >= 224 && t < 240) {
          var c3 = (t & 15) << 12 | (buffer[i++] & 63) << 6 | buffer[i++] & 63;
          str += c3 >= 2048 ? String.fromCharCode(c3) : replacementChar;
        } else if (t >= 240) {
          var t2 = (t & 7) << 18 | (buffer[i++] & 63) << 12 | (buffer[i++] & 63) << 6 | buffer[i++] & 63;
          if (t2 < 65536 || t2 > 1114111)
            str += replacementChar;
          else {
            t2 -= 65536;
            str += String.fromCharCode(55296 + (t2 >> 10));
            str += String.fromCharCode(56320 + (t2 & 1023));
          }
        }
      }
      return str;
    };
    utf82.write = function utf8_write(string, buffer, offset) {
      var start = offset, c1, c2;
      for (var i = 0; i < string.length; ++i) {
        c1 = string.charCodeAt(i);
        if (c1 < 128) {
          buffer[offset++] = c1;
        } else if (c1 < 2048) {
          buffer[offset++] = c1 >> 6 | 192;
          buffer[offset++] = c1 & 63 | 128;
        } else if ((c1 & 64512) === 55296 && ((c2 = string.charCodeAt(i + 1)) & 64512) === 56320) {
          c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
          ++i;
          buffer[offset++] = c1 >> 18 | 240;
          buffer[offset++] = c1 >> 12 & 63 | 128;
          buffer[offset++] = c1 >> 6 & 63 | 128;
          buffer[offset++] = c1 & 63 | 128;
        } else {
          buffer[offset++] = c1 >> 12 | 224;
          buffer[offset++] = c1 >> 6 & 63 | 128;
          buffer[offset++] = c1 & 63 | 128;
        }
      }
      return offset - start;
    };
  })(utf8);
  return utf8;
}
export {
  requireUtf8 as r
};
